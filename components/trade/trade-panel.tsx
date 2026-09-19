"use client";

import { useState } from "react";
import { History, ShieldCheck } from "lucide-react";

export default function TradePanel({ symbol, chain, quoteEnabled, broadcastEnabled }: { symbol: string; chain: string; quoteEnabled: boolean; broadcastEnabled: boolean }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [slippage, setSlippage] = useState("0.5");
  const [asset, setAsset] = useState<"native" | "stable">("native");
  const [amount, setAmount] = useState("");
  return <aside className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-5 lg:sticky lg:top-5 lg:self-start">
    <div className="flex rounded-xl bg-white/[0.04] p-1"><button type="button" onClick={() => setSide("buy")} className={`flex-1 rounded-lg py-2 text-sm ${side === "buy" ? "bg-emerald-300/15 text-emerald-300" : "text-slate-500"}`}>买入</button><button type="button" onClick={() => setSide("sell")} className={`flex-1 rounded-lg py-2 text-sm ${side === "sell" ? "bg-red-300/15 text-red-300" : "text-slate-500"}`}>卖出</button></div>
    <div className="mt-4 grid grid-cols-2 gap-2">{(["native", "stable"] as const).map((value) => <button type="button" key={value} onClick={() => setAsset(value)} className={`rounded-lg border py-2 text-xs ${asset === value ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "border-white/[0.07] text-slate-500"}`}>{value === "native" ? (chain === "sol" ? "SOL" : "原生币") : "稳定币"}</button>)}</div>
    <div className="mt-4"><div className="flex justify-between text-xs text-slate-500"><span>{side === "buy" ? "支付" : "卖出"}</span><span>{side === "buy" ? (asset === "stable" ? "USDC" : chain === "sol" ? "SOL" : "原生币") : symbol}</span></div><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/20"/></div>
    <div className="mt-3 grid grid-cols-4 gap-2">{(side === "buy" ? ["0.1", "0.5", "1", "5"] : ["25%", "50%", "75%", "100%"]).map((value) => <button type="button" key={value} onClick={() => { if (side === "buy") setAmount(value); }} className="rounded-lg border border-white/[0.07] py-2 text-xs text-slate-400">{value}</button>)}</div>
    <label className="mt-5 block text-xs text-slate-500">滑点</label><div className="mt-2 flex gap-2">{["0.3", "0.5", "1.0"].map((value) => <button type="button" key={value} onClick={() => setSlippage(value)} className={`flex-1 rounded-lg border py-2 text-xs ${slippage === value ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "border-white/[0.07] text-slate-500"}`}>{value}%</button>)}</div>
    <div className="mt-5 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs"><Summary label="预计获得" value={`-- ${symbol}`}/><Summary label="最少获得" value="--"/><Summary label="报价价格 / 价格影响" value="--"/><Summary label="Gas / 优先费" value="--"/><Summary label="路由 / 有效期" value="--"/></div>
    <button type="button" disabled className="mt-4 w-full rounded-xl bg-cyan-300/10 py-3 text-sm text-cyan-200/60">{!quoteEnabled ? "只读报价尚未开放" : !broadcastEnabled ? "连接钱包后获取只读报价" : "连接钱包并逐笔确认"}</button>
    <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-600"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>报价会校验链、代币、授权目标、交易目标、最少获得和有效期。风险命中时阻止继续。</p>
    <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2 text-xs text-slate-400"><History size={14}/>本钱包交易记录</div><p className="mt-3 rounded-lg bg-white/[0.02] px-3 py-4 text-center text-xs text-slate-600">连接钱包后显示本地记录；拿到交易哈希后才写入状态。</p></div>
  </aside>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><span className="text-slate-600">{label}</span><span className="truncate text-slate-300">{value}</span></div>; }
