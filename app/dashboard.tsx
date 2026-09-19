"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BellRing, ChevronRight, Clock3, Database, Flame, RadioTower, Search, Sparkles, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CopyAddress from "./signal/[id]/copy-address";
import type { AlertSummary, ChainHealth, SourceHealth } from "@/lib/ops-status";
import WalletButton from "@/components/wallet/wallet-button";

export type SignalRow = {
  id: number; chain: string; tokenAddress: string; name: string; symbol: string; logo: string; threshold: number; holderCount: number;
  marketCap: number; liquidity: number; holders: number; volume24h: number; gmgnTheme: string; aiAnalysis: string;
  alertedAt: string; walletNames: string[]; demo?: boolean;
};

const chainName: Record<string, string> = { sol: "Solana", bsc: "BSC", base: "Base", robinhood: "Robinhood" };
const chainTone: Record<string, string> = { sol: "text-violet-300 bg-violet-400/10 border-violet-300/15", bsc: "text-amber-300 bg-amber-400/10 border-amber-300/15", base: "text-blue-300 bg-blue-400/10 border-blue-300/15", robinhood: "text-emerald-300 bg-emerald-400/10 border-emerald-300/15" };
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value || 0); }
function shortAddress(value: string) { return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value; }
function timeAgo(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "刚刚"; if (minutes < 60) return `${minutes}分钟前`; if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`; return `${Math.floor(minutes / 1440)}天前`; }
function validImage(value: string) { return /^https:\/\//i.test(value); }
function hotScore(signal: SignalRow) { return signal.holderCount * 100_000_000 + signal.threshold * 1_000_000 + Math.log10(Math.max(1, signal.volume24h)) * 10_000 + Number(new Date(signal.alertedAt)) / 100_000_000; }

export default function Dashboard({ signals: initialSignals, walletCount, lastRun: initialLastRun, monitorOk: initialMonitorOk, demo, chainHealth: initialChainHealth, sourceHealth: initialSourceHealth, alertSummary: initialAlertSummary }: { signals: SignalRow[]; walletCount: number; lastRun: string | null; monitorOk: boolean; demo: boolean; chainHealth: ChainHealth[]; sourceHealth: SourceHealth[]; alertSummary: AlertSummary }) {
  const [signals, setSignals] = useState(initialSignals);
  const [lastRun, setLastRun] = useState(initialLastRun);
  const [monitorOk, setMonitorOk] = useState(initialMonitorOk);
  const [chainHealth, setChainHealth] = useState(initialChainHealth);
  const [sourceHealth, setSourceHealth] = useState(initialSourceHealth);
  const [alertSummary, setAlertSummary] = useState(initialAlertSummary);
  const [chain, setChain] = useState("all");
  const [query, setQuery] = useState("");
  const [newIds, setNewIds] = useState<number[]>([]);
  const knownIds = useRef(new Set(initialSignals.map((signal) => signal.id)));
  useEffect(() => {
    if (demo) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/signals", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { signals: SignalRow[]; lastRun: string | null; monitorOk: boolean; chainHealth: ChainHealth[]; sourceHealth: SourceHealth[]; alertSummary: AlertSummary };
        if (!active) return;
        const fresh = payload.signals.filter((signal) => !knownIds.current.has(signal.id)).map((signal) => signal.id);
        payload.signals.forEach((signal) => knownIds.current.add(signal.id));
        setSignals(payload.signals); setLastRun(payload.lastRun); setMonitorOk(payload.monitorOk); setChainHealth(payload.chainHealth); setSourceHealth(payload.sourceHealth); setAlertSummary(payload.alertSummary);
        if (fresh.length) { setNewIds(fresh); window.setTimeout(() => setNewIds([]), 7000); }
      } catch { /* retain last good view */ }
    }
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [demo]);
  const filtered = useMemo(() => signals.filter((signal) => (chain === "all" || signal.chain === chain) && `${signal.name} ${signal.symbol} ${signal.tokenAddress}`.toLowerCase().includes(query.toLowerCase())), [signals, chain, query]);
  const hotSignals = useMemo(() => [...signals].sort((a, b) => hotScore(b) - hotScore(a)).slice(0, 3), [signals]);
  const highQuality = signals.filter((signal) => signal.threshold >= 38).length;
  const uniqueTokens = new Set(signals.map((signal) => `${signal.chain}:${signal.tokenAddress}`)).size;
  return <main className="min-h-screen overflow-x-hidden bg-[#070a0f] text-[#edf2f7]">
    <div className="ambient" />
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#070a0f]/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-7"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300"><RadioTower size={18} /></div><div><div className="font-semibold tracking-tight">KOL Signal</div><div className="text-[11px] tracking-[0.18em] text-slate-500">SMART FLOW MONITOR</div></div></div><div className="flex items-center gap-2 text-sm"><span className="hidden text-slate-500 xl:inline">15秒自动刷新</span><span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-1.5 text-emerald-300 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${monitorOk || demo ? "bg-emerald-300 pulse" : "bg-amber-300"}`} />{demo ? "等待真实信号" : monitorOk ? "运行正常" : "等待调度"}</span><WalletButton/></div></div></header>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">
      {demo && <div className="mb-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">当前展示界面示例；监控产生真实信号后会自动替换。</div>}
      <SystemStatus chains={chainHealth} sources={sourceHealth} alerts={alertSummary}/>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Users size={18} />} label="固定监控地址" value={walletCount.toLocaleString()} detail="另含 GMGN 实时 KOL" /><Metric icon={<BellRing size={18} />} label="预警代币" value={uniqueTokens.toString()} detail="去重后的聚集信号" /><Metric icon={<Sparkles size={18} />} label="高质量信号" value={highQuality.toString()} detail="达到 38 人及以上" accent /><Metric icon={<Clock3 size={18} />} label="最近同步" value={lastRun ? timeAgo(lastRun) : "待运行"} detail="15秒刷新页面数据" /></section>
      {!demo && hotSignals.length > 0 && <section className="mt-6 rounded-2xl border border-orange-300/10 bg-gradient-to-r from-orange-300/[0.06] to-[#0b1018] p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><Flame size={17} className="text-orange-300"/><h2 className="font-semibold">热门信号</h2><span className="text-xs text-slate-600">按KOL聚集、预警级别与成交热度综合排序</span></div><div className="grid gap-3 lg:grid-cols-3">{hotSignals.map((signal) => <HotCard key={signal.id} signal={signal}/>)}</div></section>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/90 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h1 className="text-lg font-semibold tracking-tight">最新聚集预警</h1><p className="mt-1 text-sm text-slate-500">新信号自动置顶并高亮，重复加仓只计一人</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或合约" className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition focus:border-cyan-300/30" /></div></div>
        <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5"><Tabs value={chain} onValueChange={setChain}><TabsList className="h-9 bg-white/[0.04]"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="sol">Solana</TabsTrigger><TabsTrigger value="bsc">BSC</TabsTrigger><TabsTrigger value="base">Base</TabsTrigger><TabsTrigger value="robinhood">Robinhood</TabsTrigger></TabsList></Tabs></div>
        <div className="divide-y divide-white/[0.06]">{filtered.map((signal) => <SignalCard key={signal.id} signal={signal} fresh={newIds.includes(signal.id)} />)}{!filtered.length && <div className="grid min-h-60 place-items-center p-8 text-center"><div><Database className="mx-auto mb-3 text-slate-700" /><p className="text-slate-300">没有匹配的预警</p></div></div>}</div>
      </section>
      <footer className="flex flex-col gap-2 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>信号用于研究，不构成投资建议。</span><span>6人首次AI分析 · 38人更新叙事 · 58人后停止预警</span></footer>
    </div>
  </main>;
}

function SystemStatus({ chains, sources, alerts }: { chains: ChainHealth[]; sources: SourceHealth[]; alerts: AlertSummary }) {
  const tone: Record<string, string> = { healthy: "bg-emerald-300", degraded: "bg-red-400", stale: "bg-amber-300", unknown: "bg-slate-600" };
  const sourceHealthy = sources.filter((source) => source.state === "healthy").length;
  const attention = alerts.pending + alerts.retry + alerts.manualReview;
  return <section className="mb-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#0b1018]/90 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><span className="text-slate-500">四链状态</span>{chains.map((item) => <span key={item.chain} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${tone[item.state]}`}/>{chainName[item.chain] || item.chain}</span>)}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>数据源 {sourceHealthy}/{sources.length || 0} 正常</span><span className={attention ? "text-amber-300" : "text-slate-500"}>通知待处理 {attention}</span></div>
  </section>;
}

function Metric({ icon, label, value, detail, accent }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) { return <div className={`rounded-2xl border p-4 ${accent ? "border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-[#0b1018]" : "border-white/[0.08] bg-[#0b1018]/90"}`}><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><span className={accent ? "text-cyan-300" : "text-slate-600"}>{icon}</span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-slate-600">{detail}</div></div>; }
function TokenAvatar({ signal, compact=false }: { signal: SignalRow; compact?: boolean }) { const size = compact ? 36 : 44; const cls = compact ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl"; return validImage(signal.logo) ? <Image unoptimized src={signal.logo} alt="" width={size} height={size} className={`${cls} shrink-0 border border-white/[0.08] bg-white/[0.04] object-cover`}/> : <div className={`grid ${cls} shrink-0 place-items-center border border-white/[0.08] bg-white/[0.04] font-semibold text-cyan-200`}>{signal.symbol.slice(0,2)}</div>; }
function HotCard({ signal }: { signal: SignalRow }) { return <a href={`/signal/${signal.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 transition hover:border-orange-300/20 hover:bg-white/[0.025]"><TokenAvatar signal={signal} compact/><div className="min-w-0 flex-1"><div className="truncate font-medium">{signal.symbol}</div><div className="mt-1 flex gap-3 text-xs text-slate-500"><span className="text-cyan-300">{signal.holderCount} KOL</span><span>{money(signal.volume24h)} 24H</span></div></div><ChevronRight size={16} className="text-slate-700"/></a>; }
function SignalCard({ signal, fresh }: { signal: SignalRow; fresh: boolean }) { return <article className={`group grid min-w-0 gap-4 overflow-hidden p-4 transition sm:px-5 lg:grid-cols-[minmax(220px,1.05fr)_minmax(300px,1.7fr)_auto] lg:items-center ${fresh ? "bg-cyan-300/[0.07] ring-1 ring-inset ring-cyan-300/15" : "hover:bg-white/[0.025]"}`}><div className="flex min-w-0 items-center gap-3"><a href={`/signal/${signal.id}`} aria-label={`查看 ${signal.symbol} 详情`} className="shrink-0"><TokenAvatar signal={signal}/></a><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><a href={`/signal/${signal.id}`} className="truncate font-semibold hover:text-cyan-200">{signal.symbol}</a><span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${chainTone[signal.chain] || chainTone.base}`}>{chainName[signal.chain] || signal.chain}</span>{fresh && <span className="shrink-0 text-[11px] text-cyan-300">新信号</span>}</div><div className="mt-1 flex min-w-0 items-center gap-1.5"><span className="truncate font-mono text-xs text-slate-600">{shortAddress(signal.tokenAddress)}</span><CopyAddress address={signal.tokenAddress} compact/></div></div></div><a href={`/signal/${signal.id}`} className="block min-w-0 overflow-hidden"><div className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><Sparkles size={13} className="shrink-0 text-cyan-400"/><span className="shrink-0">AI分析</span><span className="hidden text-slate-700 sm:inline">·</span><span className="hidden truncate sm:inline">{signal.gmgnTheme}</span></div><p className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">{signal.aiAnalysis}</p></a><div className="flex min-w-0 items-center gap-2"><div className="grid min-w-0 flex-1 grid-cols-4 gap-1 text-center sm:gap-3 lg:text-right"><Stat label="KOL" value={`${signal.holderCount}人`} bright /><Stat label="持币地址" value={signal.holders ? signal.holders.toLocaleString() : "待补全"} /><Stat label="市值" value={money(signal.marketCap)} /><Stat label="流动性" value={money(signal.liquidity)} /></div><div className="hidden items-center gap-2 text-xs text-slate-600 2xl:flex"><Clock3 size={13}/>{timeAgo(signal.alertedAt)}</div><a href={`/signal/${signal.id}`} aria-label={`查看 ${signal.symbol} 详情`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-700 transition hover:bg-white/[0.04] hover:text-cyan-300"><ChevronRight size={18}/></a></div></article>; }
function Stat({ label, value, bright }: { label: string; value: string; bright?: boolean }) { return <div className="min-w-0"><div className="truncate text-[11px] text-slate-600">{label}</div><div className={`mt-1 truncate whitespace-nowrap text-xs font-medium sm:text-sm ${bright ? "text-cyan-300" : "text-slate-300"}`}>{value}</div></div>; }
