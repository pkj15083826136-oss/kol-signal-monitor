"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, RefreshCcw, Unplug, WalletCards } from "lucide-react";
import { useWalletRuntime } from "@/components/wallet/wallet-root";
import { WALLET_CHAIN_META, type WalletChain } from "@/lib/wallet/state";

const CHAINS: WalletChain[] = ["sol", "bsc", "base", "robinhood"];

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

export default function WalletButton() {
  const wallet = useWalletRuntime();
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const busy = wallet.phase === "connecting" || wallet.phase === "restoring" || wallet.phase === "switching";

  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [expanded]);

  if (!wallet.ready) {
    return <button type="button" className="wallet-trigger" disabled aria-label="钱包组件初始化中">
      <LoaderCircle className="animate-spin" size={15}/><span className="hidden sm:inline">钱包初始化中</span><span className="sm:hidden">钱包</span>
    </button>;
  }

  if (!wallet.address) {
    return <div className="flex min-w-0 flex-col items-end gap-1">
      <button type="button" className="wallet-trigger" disabled={busy} onClick={() => void wallet.connect()} aria-busy={busy}>
        {busy ? <LoaderCircle className="animate-spin" size={15}/> : <WalletCards size={15}/>}<span>{wallet.phase === "restoring" ? "恢复连接中" : wallet.phase === "connecting" ? "连接中" : "连接钱包"}</span>
      </button>
      {wallet.error ? <button type="button" className="max-w-52 truncate text-[10px] text-rose-300 hover:text-rose-200" onClick={() => void wallet.reconnect()} title={wallet.error}>{wallet.error} · 重新连接</button> : null}
    </div>;
  }

  return <div ref={root} className="relative min-w-0">
    <button type="button" className="wallet-trigger max-w-[230px]" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-haspopup="menu">
      {busy ? <LoaderCircle className="shrink-0 animate-spin" size={15}/> : <WalletCards className="shrink-0 text-cyan-300" size={15}/>}
      <span className="truncate">{shortAddress(wallet.address)}</span>
      <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-300 sm:inline">{wallet.chain ? WALLET_CHAIN_META[wallet.chain].name : "未知网络"}</span>
      <ChevronDown className="shrink-0" size={13}/>
    </button>
    {expanded ? <div className="wallet-menu" role="menu">
      <div className="border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center justify-between gap-2"><span className="truncate text-sm text-white">{wallet.walletName || "已连接钱包"}</span><span className="shrink-0 text-[11px] text-emerald-300">已连接</span></div>
        <button type="button" onClick={() => void wallet.openAccount()} className="mt-1 max-w-full truncate font-mono text-xs text-slate-400 hover:text-slate-200">{wallet.address}</button>
        <div className="mt-1 text-xs text-slate-400">{wallet.balanceLoading ? "余额加载中（不影响连接）" : wallet.balance || "余额暂不可用"}</div>
      </div>
      <div className="p-2">
        <div className="px-1 pb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">切换网络</div>
        <div className="grid grid-cols-2 gap-1.5">
          {CHAINS.map((chain) => <button key={chain} type="button" role="menuitem" disabled={busy} onClick={() => void wallet.switchChain(chain)} className={`wallet-chain ${wallet.chain === chain ? "wallet-chain-active" : ""}`}>
            {wallet.switchingTo === chain ? <LoaderCircle className="animate-spin" size={12}/> : null}{WALLET_CHAIN_META[chain].name}
          </button>)}
        </div>
        {wallet.error ? <div className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-2.5 py-2 text-xs leading-5 text-rose-200">{wallet.error}</div> : null}
        <button type="button" role="menuitem" className="wallet-menu-action mt-2" onClick={() => void wallet.reconnect(wallet.chain || undefined)}><RefreshCcw size={13}/>断开并重新连接</button>
        <button type="button" role="menuitem" className="wallet-menu-action text-rose-300" onClick={() => void wallet.disconnect()}><Unplug size={13}/>断开钱包</button>
      </div>
    </div> : null}
  </div>;
}
