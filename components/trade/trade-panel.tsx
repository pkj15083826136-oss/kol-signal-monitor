"use client";

import { useState } from "react";
import { AlertTriangle, History, LoaderCircle, ShieldCheck } from "lucide-react";
import { useWalletRuntime } from "@/components/wallet/wallet-root";
import { WALLET_CHAIN_META, walletMatchesTokenChain, type WalletChain } from "@/lib/wallet/state";

export default function TradePanel({ symbol, chain, quoteEnabled, broadcastEnabled }: { symbol: string; chain: string; quoteEnabled: boolean; broadcastEnabled: boolean }) {
  const wallet = useWalletRuntime();
  const targetChain = chain as WalletChain;
  const targetMeta = WALLET_CHAIN_META[targetChain];
  const chainMatches = walletMatchesTokenChain(wallet.chain, targetChain);
  const switching = wallet.switchingTo === targetChain;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [slippage, setSlippage] = useState("0.5");
  const [asset, setAsset] = useState<"native" | "stable">("native");
  const [amount, setAmount] = useState("");
  return <aside className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5 lg:sticky lg:top-5 lg:self-start">
    <div className="flex gap-1 rounded-xl border border-white/[0.08] bg-[#070b11] p-1"><button type="button" onClick={() => setSide("buy")} className={`flex-1 rounded-lg border py-2 text-sm transition ${side === "buy" ? "border-emerald-300/25 bg-emerald-300/15 text-emerald-200" : "border-white/[0.06] bg-white/[0.025] text-slate-300 hover:border-white/[0.12]"}`}>买入</button><button type="button" onClick={() => setSide("sell")} className={`flex-1 rounded-lg border py-2 text-sm transition ${side === "sell" ? "border-rose-300/25 bg-rose-300/15 text-rose-200" : "border-white/[0.06] bg-white/[0.025] text-slate-300 hover:border-white/[0.12]"}`}>卖出</button></div>
    {wallet.address && !chainMatches ? <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3 text-xs text-amber-100"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={14}/><div><div className="font-medium">当前钱包网络与代币网络不一致</div><div className="mt-1 text-amber-100/65">当前 {wallet.chain ? WALLET_CHAIN_META[wallet.chain].name : "未知网络"}，交易目标为 {targetMeta?.name || chain}。切换成功前不会请求报价。</div></div></div><button type="button" disabled={switching} onClick={() => void wallet.switchChain(targetChain)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200/20 bg-amber-200/10 py-2 text-amber-100">{switching ? <LoaderCircle className="animate-spin" size={13}/> : null}{switching ? `正在切换到 ${targetMeta?.name || chain}` : `切换到 ${targetMeta?.name || chain}`}</button></div> : null}
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">{(["native", "stable"] as const).map((value) => <button type="button" key={value} onClick={() => setAsset(value)} className={`min-w-0 rounded-lg border py-2 text-xs ${asset === value ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "border-white/[0.07] text-slate-500"}`}>{value === "native" ? (chain === "sol" ? "SOL" : "原生币") : "稳定币"}</button>)}</div>
    <div className="mt-4"><div className="flex justify-between text-xs text-slate-500"><span>{side === "buy" ? "支付" : "卖出"}</span><span>{side === "buy" ? (asset === "stable" ? "USDC" : chain === "sol" ? "SOL" : "原生币") : symbol}</span></div><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/20"/></div>
    <div className="mt-3 grid grid-cols-4 gap-2">{(side === "buy" ? ["0.1", "0.5", "1", "5"] : ["25%", "50%", "75%", "100%"]).map((value) => <button type="button" key={value} onClick={() => { if (side === "buy") setAmount(value); }} className="rounded-lg border border-white/[0.07] py-2 text-xs text-slate-400">{value}</button>)}</div>
    <label className="mt-5 block text-xs text-slate-500">滑点</label><div className="mt-2 flex gap-2">{["0.3", "0.5", "1.0"].map((value) => <button type="button" key={value} onClick={() => setSlippage(value)} className={`flex-1 rounded-lg border py-2 text-xs ${slippage === value ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "border-white/[0.07] text-slate-500"}`}>{value}%</button>)}</div>
    <div className="mt-5 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs"><Summary label="预计获得" value={`-- ${symbol}`}/><Summary label="最少获得" value="--"/><Summary label="报价价格 / 价格影响" value="--"/><Summary label="Gas / 优先费" value="--"/><Summary label="路由 / 有效期" value="--"/></div>
    <button type="button" disabled className="mt-4 w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-slate-700/30 py-3 text-sm text-slate-400">{!quoteEnabled ? "只读报价尚未开放" : !wallet.address ? "连接钱包后获取只读报价" : !chainMatches ? `请先切换到 ${targetMeta?.name || chain}` : !broadcastEnabled ? "只读报价（不签名、不广播）" : "连接钱包并逐笔确认"}</button>
    <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-600"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>报价会校验链、代币、授权目标、交易目标、最少获得和有效期。风险命中时阻止继续。</p>
    <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2 text-xs text-slate-400"><History size={14}/>本钱包交易记录</div><p className="mt-3 rounded-lg bg-white/[0.02] px-3 py-4 text-center text-xs text-slate-600">连接钱包后显示本地记录；拿到交易哈希后才写入状态。</p></div>
  </aside>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-slate-600">{label}</span><span className="truncate text-slate-300">{value}</span></div>; }
