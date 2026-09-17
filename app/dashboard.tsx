"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BellRing, ChevronRight, Clock3, Database, RadioTower, Search, Sparkles, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SignalRow = {
  id: number; chain: string; tokenAddress: string; name: string; symbol: string; threshold: number; holderCount: number;
  marketCap: number; liquidity: number; holders: number; volume24h: number; gmgnTheme: string; aiAnalysis: string;
  alertedAt: string; walletNames: string[]; demo?: boolean;
};

const chainName: Record<string, string> = { sol: "Solana", bsc: "BSC", base: "Base", robinhood: "Robinhood" };
const chainTone: Record<string, string> = { sol: "text-violet-300 bg-violet-400/10 border-violet-300/15", bsc: "text-amber-300 bg-amber-400/10 border-amber-300/15", base: "text-blue-300 bg-blue-400/10 border-blue-300/15", robinhood: "text-emerald-300 bg-emerald-400/10 border-emerald-300/15" };

function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value || 0); }
function shortAddress(value: string) { return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value; }
function timeAgo(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "刚刚"; if (minutes < 60) return `${minutes}分钟前`; if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`; return `${Math.floor(minutes / 1440)}天前`; }

export default function Dashboard({ signals, walletCount, lastRun, monitorOk, demo }: { signals: SignalRow[]; walletCount: number; lastRun: string | null; monitorOk: boolean; demo: boolean }) {
  const [chain, setChain] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => signals.filter((signal) => (chain === "all" || signal.chain === chain) && `${signal.name} ${signal.symbol} ${signal.tokenAddress}`.toLowerCase().includes(query.toLowerCase())), [signals, chain, query]);
  const highQuality = signals.filter((signal) => signal.threshold >= 38).length;
  const uniqueTokens = new Set(signals.map((signal) => `${signal.chain}:${signal.tokenAddress}`)).size;
  return <main className="min-h-screen bg-[#070a0f] text-[#edf2f7]">
    <div className="ambient" />
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#070a0f]/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-7"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300"><RadioTower size={18} /></div><div><div className="font-semibold tracking-tight">KOL Signal</div><div className="text-[11px] tracking-[0.18em] text-slate-500">SMART FLOW MONITOR</div></div></div><div className="flex items-center gap-3 text-sm"><span className="hidden text-slate-500 sm:inline">四链实时监控</span><span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-1.5 text-emerald-300"><span className={`h-1.5 w-1.5 rounded-full ${monitorOk || demo ? "bg-emerald-300 pulse" : "bg-amber-300"}`} />{demo ? "等待真实信号" : monitorOk ? "运行正常" : "等待调度"}</span></div></div></header>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">
      {demo && <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100"><span>当前展示界面示例；监控产生真实信号后会自动替换。</span><span className="hidden text-amber-300/70 sm:inline">信号阈值 6 · 18 · 38 · 58</span></div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Users size={18} />} label="监控地址" value={walletCount.toLocaleString()} detail="KOL + 顶级交易员" /><Metric icon={<BellRing size={18} />} label="预警代币" value={uniqueTokens.toString()} detail="去重后的聚集信号" /><Metric icon={<Sparkles size={18} />} label="高质量信号" value={highQuality.toString()} detail="达到 38 人及以上" accent /><Metric icon={<Clock3 size={18} />} label="最近同步" value={lastRun ? timeAgo(lastRun) : "待运行"} detail="GMGN · X · 企业微信" /></section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/90 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h1 className="text-lg font-semibold tracking-tight">聚集预警</h1><p className="mt-1 text-sm text-slate-500">按独立监控地址的首次建仓统计，重复加仓只计一人</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或合约" className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition focus:border-cyan-300/30" /></div></div>
        <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5"><Tabs value={chain} onValueChange={setChain}><TabsList className="h-9 bg-white/[0.04]"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="sol">Solana</TabsTrigger><TabsTrigger value="bsc">BSC</TabsTrigger><TabsTrigger value="base">Base</TabsTrigger><TabsTrigger value="robinhood">Robinhood</TabsTrigger></TabsList></Tabs></div>
        <div className="divide-y divide-white/[0.06]">{filtered.map((signal) => <SignalCard key={`${signal.id}-${signal.threshold}`} signal={signal} />)}{!filtered.length && <div className="grid min-h-60 place-items-center p-8 text-center"><div><Database className="mx-auto mb-3 text-slate-700" /><p className="text-slate-300">没有匹配的预警</p><p className="mt-1 text-sm text-slate-600">调整链或搜索条件后再试</p></div></div>}</div>
      </section>
      <footer className="flex flex-col gap-2 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>信号用于研究，不构成投资建议。</span><span>6人首次AI分析 · 38人更新叙事 · 58人后停止预警</span></footer>
    </div>
  </main>;
}

function Metric({ icon, label, value, detail, accent }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) { return <div className={`rounded-2xl border p-4 ${accent ? "border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-[#0b1018]" : "border-white/[0.08] bg-[#0b1018]/90"}`}><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><span className={accent ? "text-cyan-300" : "text-slate-600"}>{icon}</span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-slate-600">{detail}</div></div>; }
function SignalCard({ signal }: { signal: SignalRow }) { const href = signal.id > 0 ? `/signal/${signal.id}` : "#"; return <Link href={href} className="group grid gap-4 p-4 transition hover:bg-white/[0.025] sm:px-5 lg:grid-cols-[minmax(220px,1.15fr)_minmax(320px,2fr)_auto] lg:items-center"><div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] font-semibold text-cyan-200">{signal.symbol.slice(0, 2)}</div><div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate font-semibold">{signal.name}</strong><span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${chainTone[signal.chain] || chainTone.base}`}>{chainName[signal.chain] || signal.chain}</span>{signal.demo && <span className="text-[11px] text-amber-300/70">示例</span>}</div><div className="mt-1 font-mono text-xs text-slate-600">{shortAddress(signal.tokenAddress)}</div></div></div><div><div className="flex items-center gap-2 text-xs text-slate-500"><Sparkles size={13} className="text-cyan-400" /><span>AI分析</span><span className="text-slate-700">·</span><span>{signal.gmgnTheme}</span></div><p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-300">{signal.aiAnalysis}</p></div><div className="flex items-center justify-between gap-6 lg:justify-end"><div className="grid grid-cols-3 gap-5 text-right"><Stat label="KOL" value={`${signal.holderCount}人`} bright /><Stat label="市值" value={money(signal.marketCap)} /><Stat label="流动性" value={money(signal.liquidity)} /></div><div className="hidden items-center gap-2 text-xs text-slate-600 xl:flex"><Clock3 size={13} />{timeAgo(signal.alertedAt)}</div><ChevronRight size={18} className="text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" /></div></Link>; }
function Stat({ label, value, bright }: { label: string; value: string; bright?: boolean }) { return <div><div className="text-[11px] text-slate-600">{label}</div><div className={`mt-1 text-sm font-medium ${bright ? "text-cyan-300" : "text-slate-300"}`}>{value}</div></div>; }
