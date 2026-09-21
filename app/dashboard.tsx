"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BellRing, ChevronRight, Clock3, Database, Flame, Radar, RadioTower, Search, Sparkles, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CopyAddress from "./signal/[id]/copy-address";
import type { AlertSummary, ChainHealth, SourceHealth } from "@/lib/ops-status";
import WalletButton from "@/components/wallet/wallet-button";
import { useLiveMarket } from "@/lib/use-live-market";
import { isMarketStale, marketKey, type LiveMarketItem, type MarketDirection } from "@/lib/market-live";
import { chainLabel, chainTone } from "@/lib/chains";
import { formatSignalAge, formatUsdCompact } from "@/lib/market-format";

export type SignalRow = {
  id: number; chain: string; tokenAddress: string; name: string; symbol: string; logo: string; threshold: number; holderCount: number;
  price?: number; marketCap: number; liquidity: number; holders: number; volume24h: number; gmgnTheme: string; aiAnalysis: string;
  createdAt: string; walletNames: string[]; signalOrigin?: string; radarScore?: number | null; demo?: boolean;
};

export const LIST_METRIC_LABELS = ["KOL人数", "持币地址", "市值", "流动性", "24H交易额", "预警时间"] as const;
const LIST_STATE_KEY = "kol-signal-list-state";
function initialListState() {
  if (typeof window === "undefined") return { chain: "all", query: "", scrollY: 0 };
  try { return { chain: "all", query: "", scrollY: 0, ...JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || "{}") } as { chain: string; query: string; scrollY: number }; }
  catch { return { chain: "all", query: "", scrollY: 0 }; }
}
function shortAddress(value: string) { return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value; }
function validImage(value: string) { return /^https:\/\//i.test(value); }
function hotScore(signal: SignalRow) { return signal.holderCount * 100_000_000 + signal.threshold * 1_000_000 + Math.log10(Math.max(1, signal.volume24h)) * 10_000 + Number(new Date(signal.createdAt)) / 100_000_000; }

export default function Dashboard({ signals: initialSignals, walletCount, lastRun: initialLastRun, monitorOk: initialMonitorOk, demo, liveMarketEnabled, chainHealth: initialChainHealth, sourceHealth: initialSourceHealth, alertSummary: initialAlertSummary }: { signals: SignalRow[]; walletCount: number; lastRun: string | null; monitorOk: boolean; demo: boolean; liveMarketEnabled: boolean; chainHealth: ChainHealth[]; sourceHealth: SourceHealth[]; alertSummary: AlertSummary }) {
  const [signals, setSignals] = useState(initialSignals);
  const [lastRun, setLastRun] = useState(initialLastRun);
  const [monitorOk, setMonitorOk] = useState(initialMonitorOk);
  const [chainHealth, setChainHealth] = useState(initialChainHealth);
  const [sourceHealth, setSourceHealth] = useState(initialSourceHealth);
  const [alertSummary, setAlertSummary] = useState(initialAlertSummary);
  const [savedState] = useState(initialListState);
  const [chain, setChain] = useState(savedState.chain);
  const [query, setQuery] = useState(savedState.query);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<number[]>([]);
  const knownIds = useRef(new Set(initialSignals.map((signal) => signal.id)));
  useEffect(() => { requestAnimationFrame(() => window.scrollTo({ top: savedState.scrollY || 0 })); }, [savedState.scrollY]);
  useEffect(() => {
    const save = () => sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({ chain, query, scrollY: window.scrollY }));
    window.addEventListener("scroll", save, { passive: true });
    save();
    return () => window.removeEventListener("scroll", save);
  }, [chain, query]);
  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
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
    let timer = 0;
    const schedule = () => { timer = window.setTimeout(async () => { await refresh(); if (active) schedule(); }, 15_000); };
    const visibility = () => { if (!document.hidden) { window.clearTimeout(timer); void refresh().finally(schedule); } };
    void refresh().finally(schedule);
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [demo]);
  const filtered = useMemo(() => signals.filter((signal) => (chain === "all" || signal.chain === chain) && `${signal.name} ${signal.symbol} ${signal.tokenAddress}`.toLowerCase().includes(query.toLowerCase())), [signals, chain, query]);
  const hotSignals = useMemo(() => [...signals].sort((a, b) => hotScore(b) - hotScore(a)).slice(0, 3), [signals]);
  const liveTokens = useMemo(() => signals.slice(0, 30).map((signal) => ({ chain: signal.chain, address: signal.tokenAddress })), [signals]);
  const live = useLiveMarket(liveTokens, liveMarketEnabled);
  const highQuality = signals.filter((signal) => signal.threshold >= 38).length;
  const uniqueTokens = new Set(signals.map((signal) => `${signal.chain}:${signal.tokenAddress}`)).size;
  return <main className="min-h-screen overflow-x-hidden bg-[#070a0f] text-[#edf2f7]">
    <div className="ambient" />
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#070a0f]/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-7"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300"><RadioTower size={18} /></div><div><div className="font-semibold tracking-tight">KOL Signal</div><div className="text-[11px] tracking-[0.18em] text-slate-500">SMART FLOW MONITOR</div></div></div><div className="flex items-center gap-2 text-sm"><a href="/radar" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] px-2.5 py-1.5 text-xs text-cyan-200 hover:bg-cyan-300/[0.1]"><Radar size={14}/><span className="hidden sm:inline">土狗雷达</span></a><span className="hidden text-slate-500 xl:inline">15秒自动刷新</span><span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-1.5 text-emerald-300 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${monitorOk || demo ? "bg-emerald-300 pulse" : "bg-amber-300"}`} />{demo ? "等待真实信号" : monitorOk ? "运行正常" : "等待调度"}</span><WalletButton/></div></div></header>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">
      {demo && <div className="mb-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">暂无生产信号数据；不会使用演示行情替代。</div>}
      <SystemStatus chains={chainHealth} sources={sourceHealth} alerts={alertSummary}/>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Users size={18} />} label="固定监控地址" value={walletCount.toLocaleString()} detail="另含 GMGN 实时 KOL" /><Metric icon={<BellRing size={18} />} label="预警代币" value={uniqueTokens.toString()} detail="去重后的聚集信号" /><Metric icon={<Sparkles size={18} />} label="高质量信号" value={highQuality.toString()} detail="达到 38 人及以上" accent /><Metric icon={<Clock3 size={18} />} label="最近同步" value={lastRun ? formatSignalAge(lastRun, clockNow) : "待运行"} detail="15秒刷新页面数据" /></section>
      {!demo && hotSignals.length > 0 && <section className="mt-6 rounded-2xl border border-orange-300/10 bg-gradient-to-r from-orange-300/[0.06] to-[#0b1018] p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><Flame size={17} className="text-orange-300"/><h2 className="font-semibold">热门信号</h2><span className="text-xs text-slate-600">按KOL聚集、预警级别与成交热度综合排序</span></div><div className="grid gap-3 lg:grid-cols-3">{hotSignals.map((signal) => <HotCard key={signal.id} signal={signal}/>)}</div></section>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/90 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h1 className="text-lg font-semibold tracking-tight">最新聚集预警</h1><p className="mt-1 text-sm text-slate-500">新信号自动置顶并高亮，重复加仓只计一人</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或合约" className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition focus:border-cyan-300/30" /></div></div>
        <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5"><Tabs value={chain} onValueChange={setChain}><TabsList className="h-9 bg-white/[0.04]"><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="sol">Solana</TabsTrigger><TabsTrigger value="bsc">BSC</TabsTrigger><TabsTrigger value="base">Base</TabsTrigger><TabsTrigger value="robinhood">Robinhood</TabsTrigger></TabsList></Tabs></div>
        <div className="divide-y divide-white/[0.06]">{filtered.map((signal) => <SignalCard key={signal.id} signal={signal} fresh={newIds.includes(signal.id)} live={live.items[marketKey(signal.chain, signal.tokenAddress)]} now={clockNow} />)}{!filtered.length && <div className="grid min-h-60 place-items-center p-8 text-center"><div><Database className="mx-auto mb-3 text-slate-700" /><p className="text-slate-300">没有匹配的预警</p></div></div>}</div>
        <div className="border-t border-white/[0.06] px-5 py-2 text-right text-[11px] text-slate-600">{liveMarketEnabled ? "动态行情：前台 3 秒 · 后台 15 秒" : "动态行情未启用"}{live.degraded ? " · 部分数据源降级" : ""}</div>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><span className="text-slate-500">四链状态</span>{chains.map((item) => <span key={item.chain} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${tone[item.state]}`}/>{chainLabel(item.chain)}</span>)}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>数据源 {sourceHealthy}/{sources.length || 0} 正常</span><span className={attention ? "text-amber-300" : "text-slate-500"}>通知待处理 {attention}</span></div>
  </section>;
}

function Metric({ icon, label, value, detail, accent }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) { return <div className={`rounded-2xl border p-4 ${accent ? "border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-[#0b1018]" : "border-white/[0.08] bg-[#0b1018]/90"}`}><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><span className={accent ? "text-cyan-300" : "text-slate-600"}>{icon}</span></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-slate-600">{detail}</div></div>; }
function TokenAvatar({ signal, compact=false }: { signal: SignalRow; compact?: boolean }) { const size = compact ? 36 : 44; const cls = compact ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl"; return validImage(signal.logo) ? <Image unoptimized src={signal.logo} alt="" width={size} height={size} className={`${cls} shrink-0 border border-white/[0.08] bg-white/[0.04] object-cover`}/> : <div className={`grid ${cls} shrink-0 place-items-center border border-white/[0.08] bg-white/[0.04] font-semibold text-cyan-200`}>{signal.symbol.slice(0,2)}</div>; }
function HotCard({ signal }: { signal: SignalRow }) { return <a href={`/signal/${signal.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 transition hover:border-orange-300/20 hover:bg-white/[0.025]"><TokenAvatar signal={signal} compact/><div className="min-w-0 flex-1"><div className="truncate font-medium">{signal.symbol}</div><div className="mt-1 flex gap-3 text-xs text-slate-500"><span className="text-cyan-300">{signal.holderCount} KOL</span><span>{formatUsdCompact(signal.volume24h)} 24H</span></div></div><ChevronRight size={16} className="text-slate-700"/></a>; }
function SignalCard({ signal, fresh, live, now }: { signal: SignalRow; fresh: boolean; live?: LiveMarketItem; now: number }) {
  const stale = Boolean(live && (live.source === "unavailable" || isMarketStale(live.updatedAt)));
  const valueOrFallback = (value: number | null | undefined, fallback: number) => value !== null && value !== undefined && value > 0 ? value : fallback;
  const holders = valueOrFallback(live?.holders, signal.holders);
  const marketCap = valueOrFallback(live?.marketCap, signal.marketCap);
  const liquidity = valueOrFallback(live?.liquidity, signal.liquidity);
  const volume24h = valueOrFallback(live?.volume24h, signal.volume24h);
  const href = `/signal/${signal.id}`;
  const remember = () => {
    try { sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || "{}"), scrollY: window.scrollY })); }
    catch { sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({ scrollY: window.scrollY })); }
  };
  return <article className={`group grid min-w-0 gap-4 overflow-hidden p-4 transition sm:px-5 xl:min-h-28 xl:grid-cols-[minmax(220px,0.9fr)_minmax(280px,1.05fr)_minmax(640px,1.8fr)] xl:items-center ${fresh ? "bg-cyan-300/[0.07] ring-1 ring-inset ring-cyan-300/15" : "hover:bg-white/[0.025]"}`}>
    <div className="flex min-w-0 items-center gap-3"><a href={href} onClick={remember} aria-label={`查看 ${signal.symbol} 详情`} className="shrink-0"><TokenAvatar signal={signal}/></a><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><a href={href} onClick={remember} className="truncate font-semibold hover:text-cyan-200">{signal.symbol}</a><span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${chainTone(signal.chain)}`}>{chainLabel(signal.chain)}</span>{signal.signalOrigin === "radar" && <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] px-1.5 py-0.5 text-[10px] text-cyan-200">土狗雷达 · AI {signal.radarScore ?? 0}</span>}{fresh && <span className="shrink-0 text-[11px] text-cyan-300">新信号</span>}</div><div className="mt-1 flex min-w-0 items-center gap-1.5"><span className="inline-flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate font-mono text-xs text-slate-500">{shortAddress(signal.tokenAddress)}</span><CopyAddress address={signal.tokenAddress} compact/></span>{stale && <span className="shrink-0 text-[10px] text-amber-300">行情延迟</span>}</div></div></div>
    <a href={href} onClick={remember} className="block min-w-0 overflow-hidden"><div className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><Sparkles size={13} className="shrink-0 text-cyan-400"/><span className="shrink-0">AI分析</span><span className="text-slate-700">·</span><span className="truncate">{signal.gmgnTheme}</span></div><p className="mt-1.5 line-clamp-2 min-h-12 break-words text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">{signal.aiAnalysis}</p></a>
    <div className="flex min-w-0 items-center gap-2"><div className="grid min-w-0 flex-1 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 text-right sm:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[64px_88px_102px_102px_112px_104px]"><Stat label="KOL人数" value={`${signal.holderCount}人`} bright/><Stat label="持币地址" value={holders > 0 ? holders.toLocaleString() : "--"}/><Stat label="市值" value={formatUsdCompact(marketCap)} direction={live?.marketCap ? live.directions.marketCap : undefined}/><Stat label="流动性" value={formatUsdCompact(liquidity)} direction={live?.liquidity ? live.directions.liquidity : undefined}/><Stat label="24H交易额" value={formatUsdCompact(volume24h)} direction={live?.volume24h ? live.directions.volume24h : undefined}/><Stat label="预警时间" value={formatSignalAge(signal.createdAt, now)} /></div><a href={href} onClick={remember} aria-label={`查看 ${signal.symbol} 详情`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] text-slate-500 transition hover:border-cyan-300/20 hover:bg-white/[0.04] hover:text-cyan-300"><ChevronRight size={18}/></a></div>
  </article>;
}
function Stat({ label, value, bright, direction }: { label: string; value: string; bright?: boolean; direction?: MarketDirection }) { const tone = direction === "up" ? "text-emerald-300" : direction === "down" ? "text-red-300" : bright ? "text-cyan-300" : "text-slate-300"; return <div className="min-w-0"><div className="truncate text-[11px] text-slate-600">{label}</div><div className={`mt-1 truncate whitespace-nowrap text-xs font-medium sm:text-sm ${tone}`}>{value}</div></div>; }
