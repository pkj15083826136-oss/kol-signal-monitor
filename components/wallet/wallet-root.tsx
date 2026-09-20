"use client";

import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { WalletChain, WalletNamespace, WalletPhase } from "@/lib/wallet/state";

export type WalletRuntimeConfig = { enabled: boolean; projectId: string | null };
export type WalletAccount = { address: string | null; connected: boolean };
export type WalletContextValue = {
  ready: boolean; phase: WalletPhase; address: string | null; chain: WalletChain | null; namespace: WalletNamespace | null;
  balance: string | null; balanceLoading: boolean; error: string | null; walletName: string | null; switchingTo: WalletChain | null;
  accounts: Record<WalletNamespace, WalletAccount>;
  connect: (target?: WalletChain) => Promise<void>; switchChain: (target: WalletChain) => Promise<void>;
  disconnect: () => Promise<void>; reconnect: (target?: WalletChain) => Promise<void>; openAccount: () => Promise<void>;
};

const emptyAccounts: Record<WalletNamespace, WalletAccount> = { eip155: { address: null, connected: false }, solana: { address: null, connected: false } };
export const fallbackWallet: WalletContextValue = { ready: false, phase: "idle", address: null, chain: null, namespace: null, balance: null, balanceLoading: false, error: null, walletName: null, switchingTo: null, accounts: emptyAccounts, connect: async () => {}, switchChain: async () => {}, disconnect: async () => {}, reconnect: async () => {}, openAccount: async () => {} };
export const WalletContext = createContext<WalletContextValue>(fallbackWallet);
export function useWalletRuntime() { return useContext(WalletContext); }

export default function WalletRoot({ config, children }: { config: WalletRuntimeConfig; children: ReactNode }) {
  const [Bridge, setBridge] = useState<ComponentType<{ children: ReactNode }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!config.enabled || !config.projectId) return;
    Promise.all([import("./reown-client"), import("./wallet-bridge")])
      .then(async ([{ initializeReown }, bridge]) => {
        await initializeReown(config.projectId!);
        if (active) setBridge(() => bridge.default);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [config.enabled, config.projectId]);
  const enabled = config.enabled && Boolean(config.projectId);
  return <div data-wallet-enabled={enabled} data-wallet-ready={Boolean(Bridge)} data-wallet-init-error={failed}>
    {Bridge ? <Bridge>{children}</Bridge> : <WalletContext.Provider value={{ ...fallbackWallet, error: failed ? "钱包组件初始化失败" : null }}>{children}</WalletContext.Provider>}
  </div>;
}
