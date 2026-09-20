"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppKit, useAppKitAccount, useAppKitBalance, useAppKitNetwork, useAppKitState, useDisconnect, useWalletInfo } from "@reown/appkit/react";
import { WalletContext, type WalletAccount, type WalletContextValue } from "@/components/wallet/wallet-root";
import { walletNetworkByChain } from "@/lib/wallet/networks";
import { chainFromNetwork, validWalletAddress, WALLET_CHAIN_META, WalletOperationGate, walletConnectionPhase, walletErrorMessage, withWalletTimeout, type WalletChain, type WalletNamespace } from "@/lib/wallet/state";

function namespaceFor(chain: WalletChain): WalletNamespace { return WALLET_CHAIN_META[chain].namespace; }

export default function WalletBridge({ children }: { children: React.ReactNode }) {
  const evm = useAppKitAccount({ namespace: "eip155" });
  const solana = useAppKitAccount({ namespace: "solana" });
  const network = useAppKitNetwork();
  const appState = useAppKitState();
  const { open, close } = useAppKit();
  const { disconnect: appKitDisconnect } = useDisconnect();
  const { fetchBalance } = useAppKitBalance();
  const [operation, setOperation] = useState<{ kind: "connect" | "switch"; target: WalletChain | null; generation: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [restoreTimedOut, setRestoreTimedOut] = useState(false);
  const [locallyDisconnected, setLocallyDisconnected] = useState(false);
  const gate = useRef(new WalletOperationGate());
  const operationRef = useRef<{ kind: "connect" | "switch"; target: WalletChain | null; generation: number } | null>(null);
  const balanceGeneration = useRef(0);
  const modalWasOpen = useRef(false);
  const chain = chainFromNetwork(network.chainId, network.caipNetworkId);
  const namespace: WalletNamespace = chain ? namespaceFor(chain) : solana.isConnected && !evm.isConnected ? "solana" : "eip155";
  const account = namespace === "solana" ? solana : evm;
  const sessionAddress = validWalletAddress(namespace, account.address) ? account.address! : null;
  const address = locallyDisconnected ? null : sessionAddress;
  const connected = Boolean(address);
  const { walletInfo } = useWalletInfo(namespace);
  const accountStatus = connected ? "connected" : operation ? account.status : evm.status === "reconnecting" || solana.status === "reconnecting" ? "reconnecting" : account.status;
  const phase = walletConnectionPhase({ address, namespace, accountStatus, operation: operation?.kind || null, restoreTimedOut });
  const accounts = useMemo<Record<WalletNamespace, WalletAccount>>(() => ({
    eip155: { address: validWalletAddress("eip155", evm.address) ? evm.address! : null, connected: evm.isConnected && validWalletAddress("eip155", evm.address) },
    solana: { address: validWalletAddress("solana", solana.address) ? solana.address! : null, connected: solana.isConnected && validWalletAddress("solana", solana.address) },
  }), [evm.address, evm.isConnected, solana.address, solana.isConnected]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      operationRef.current = null; setOperation(null); setError(null); setRestoreTimedOut(false); modalWasOpen.current = false;
      void close().catch(() => {});
    });
    return () => { active = false; };
  }, [connected, address, chain, close]);

  useEffect(() => {
    if (!operation || connected) return;
    const generation = operation.generation;
    const timer = setTimeout(() => {
      if (!gate.current.isCurrent(generation)) return;
      gate.current.cancel(); operationRef.current = null; setOperation(null);
      setError(operation.kind === "switch" ? `切换到 ${operation.target ? WALLET_CHAIN_META[operation.target].name : "目标网络"} 超时，请重试` : "钱包响应超时，请重新连接");
      void close().catch(() => {});
    }, 15_000);
    return () => clearTimeout(timer);
  }, [operation, connected, close]);

  useEffect(() => {
    if (appState.open) modalWasOpen.current = true;
    if (!appState.open && modalWasOpen.current && operation?.kind === "connect" && !connected) {
      gate.current.cancel(); operationRef.current = null; setOperation(null); setError("已取消钱包连接"); modalWasOpen.current = false;
    }
  }, [appState.open, operation, connected]);

  useEffect(() => {
    if (connected || accountStatus !== "reconnecting") return;
    const timer = setTimeout(() => { setRestoreTimedOut(true); setError("恢复钱包连接超时，请断开并重新连接"); }, 15_000);
    return () => clearTimeout(timer);
  }, [connected, accountStatus]);

  useEffect(() => {
    const generation = ++balanceGeneration.current;
    if (!connected || !address || !chain) {
      queueMicrotask(() => { if (generation === balanceGeneration.current) { setBalance(null); setBalanceLoading(false); } });
      return;
    }
    queueMicrotask(() => { if (generation === balanceGeneration.current) setBalanceLoading(true); });
    fetchBalance().then((result) => {
      if (generation !== balanceGeneration.current) return;
      if (result.isSuccess && result.data) setBalance(`${result.data.balance} ${result.data.symbol}`);
    }).catch(() => {}).finally(() => { if (generation === balanceGeneration.current) setBalanceLoading(false); });
  }, [connected, address, chain, fetchBalance]);

  const begin = useCallback((kind: "connect" | "switch", target: WalletChain | null) => {
    if (operationRef.current) return null;
    const generation = gate.current.begin();
    const next = { kind, target, generation };
    operationRef.current = next;
    setError(null); setRestoreTimedOut(false); setOperation(next); return generation;
  }, []);

  const connect = useCallback(async (target?: WalletChain) => {
    setLocallyDisconnected(false);
    const generation = begin("connect", target || null);
    if (generation === null) return;
    try { await withWalletTimeout(open({ view: "Connect", namespace: target ? namespaceFor(target) : undefined })); }
    catch (cause) { if (gate.current.isCurrent(generation)) { operationRef.current = null; setOperation(null); setError(walletErrorMessage(cause, "连接钱包失败")); await close().catch(() => {}); } }
  }, [begin, open, close]);

  const switchChain = useCallback(async (target: WalletChain) => {
    const targetNamespace = namespaceFor(target);
    const generation = begin("switch", target);
    if (generation === null) return;
    try {
      if (!accounts[targetNamespace].connected) {
        const next = { kind: "connect" as const, target, generation };
        operationRef.current = next; setOperation(next);
        await withWalletTimeout(open({ view: "Connect", namespace: targetNamespace }));
        return;
      }
      await withWalletTimeout(network.switchNetwork(walletNetworkByChain[target]));
      if (gate.current.isCurrent(generation)) { operationRef.current = null; setOperation(null); }
    } catch (cause) {
      if (gate.current.isCurrent(generation)) { operationRef.current = null; setOperation(null); setError(walletErrorMessage(cause, `切换到 ${WALLET_CHAIN_META[target].name} 失败`)); }
    }
  }, [begin, accounts, open, network]);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key !== "kol-wallet-sync") return;
      gate.current.cancel(); operationRef.current = null; setOperation(null); setError(null);
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const disconnect = useCallback(async () => {
    gate.current.cancel(); operationRef.current = null; balanceGeneration.current += 1; setLocallyDisconnected(true); setOperation(null); setError(null); setBalance(null); setBalanceLoading(false);
    await close().catch(() => {});
    await Promise.allSettled([appKitDisconnect({ namespace: "eip155" }), appKitDisconnect({ namespace: "solana" })]);
    try { localStorage.setItem("kol-wallet-sync", String(Date.now())); } catch {}
  }, [appKitDisconnect, close]);

  const reconnect = useCallback(async (target?: WalletChain) => {
    await disconnect();
    setLocallyDisconnected(false);
    const generation = begin("connect", target || null);
    if (generation === null) return;
    try { await withWalletTimeout(open({ view: "Connect", namespace: target ? namespaceFor(target) : undefined })); }
    catch (cause) { if (gate.current.isCurrent(generation)) { operationRef.current = null; setOperation(null); setError(walletErrorMessage(cause, "重新连接失败")); } }
  }, [disconnect, begin, open]);

  const openAccount = useCallback(async () => { await open({ view: "Account", namespace }); }, [open, namespace]);
  const value: WalletContextValue = { ready: true, phase, address, chain, namespace, balance, balanceLoading, error, walletName: walletInfo?.name || null, switchingTo: operation?.kind === "switch" ? operation.target : null, accounts, connect, switchChain, disconnect, reconnect, openAccount };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
