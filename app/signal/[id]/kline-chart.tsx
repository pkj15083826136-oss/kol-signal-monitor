"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import type { Candle, KlineResult } from "@/lib/market";
import { KLINE_INTERVALS, KLINE_META, KlineCache, klinePollingDelay, type KlineInterval } from "@/lib/kline";
import { tokenPriceScale } from "@/lib/market-format";

function Chart({ data, interval }: { data: Candle[]; interval: KlineInterval }) {
  const target = useRef<HTMLDivElement>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  useEffect(() => {
    if (!target.current) return;
    const chart = createChart(target.current, {
      height: 330, autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#080c12" }, textColor: "#64748b", attributionLogo: false },
      grid: { vertLines: { color: "#ffffff08" }, horzLines: { color: "#ffffff0d" } },
      rightPriceScale: { borderColor: "#ffffff12" }, timeScale: { borderColor: "#ffffff12", timeVisible: true, secondsVisible: false },
      localization: { timeFormatter: (time: Time) => new Date(Number(time) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#34d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#fb7185", priceFormat: { type: "price", ...tokenPriceScale(undefined) } });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#334155" });
    candleSeries.current = candles; volumeSeries.current = volume;
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    return () => { candleSeries.current = null; volumeSeries.current = null; chart.remove(); };
  }, [interval]);
  useEffect(() => {
    if (!data.length || !candleSeries.current || !volumeSeries.current) return;
    candleSeries.current.applyOptions({ priceFormat: { type: "price", ...tokenPriceScale(data.at(-1)?.close) } });
    candleSeries.current.setData(data.map((item) => ({ time: item.time as UTCTimestamp, open: item.open, high: item.high, low: item.low, close: item.close })));
    volumeSeries.current.setData(data.map((item) => ({ time: item.time as UTCTimestamp, value: item.volume, color: item.close >= item.open ? "#34d39955" : "#fb718555" })));
  }, [data]);
  return <div className="mt-4 min-h-[330px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#080c12]" ref={target} role="img" aria-label={`${KLINE_META[interval].label}K线图`}/>;
}

export default function KlineChart({ chain, address, initialFifteen }: { chain: string; address: string; initialFifteen: KlineResult }) {
  const [cache] = useState(() => {
    const value = new KlineCache();
    value.setHistory(chain, address, 15, initialFifteen);
    return value;
  });
  const [interval, setInterval] = useState<KlineInterval>(15);
  const [result, setResult] = useState(initialFifteen);
  const [historyLoaded, setHistoryLoaded] = useState(initialFifteen.candles.length > 0);
  const [loading, setLoading] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [fullRequestCount, setFullRequestCount] = useState(0);
  const [incrementalRequestCount, setIncrementalRequestCount] = useState(0);
  const [realtimeInterrupted, setRealtimeInterrupted] = useState(false);
  const generation = useRef(0);
  const fullController = useRef<AbortController | null>(null);

  useEffect(() => () => fullController.current?.abort(), []);

  async function selectInterval(next: KlineInterval) {
    const requestGeneration = ++generation.current;
    fullController.current?.abort();
    setInterval(next);
    const cached = cache.get(chain, address, next);
    if (cached?.lastFullFetchAt) {
      setResult({ candles: cached.mergedBars, source: cached.source, reason: cached.reason });
      setHistoryLoaded(cached.isHistoryLoaded);
      setRealtimeInterrupted(false);
      return;
    }
    setHistoryLoaded(false);
    setLoading(true);
    setRequestCount((count) => count + 1);
    setFullRequestCount((count) => count + 1);
    const controller = new AbortController();
    fullController.current = controller;
    try {
      const response = await fetch(`/api/market/kline?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}&interval=${next}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("K线请求失败");
      const loaded = await response.json() as KlineResult;
      if (generation.current !== requestGeneration) return;
      const state = cache.setHistory(chain, address, next, loaded);
      setResult({ candles: state.mergedBars, source: state.source, reason: state.reason });
      setHistoryLoaded(state.isHistoryLoaded);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const failed = { candles: [], source: "", reason: "K线数据源暂时不可用，已保留上次成功数据。" };
      if (generation.current === requestGeneration) { setResult(failed); setHistoryLoaded(false); }
    } finally { if (generation.current === requestGeneration) setLoading(false); }
  }

  useEffect(() => {
    if (!historyLoaded) return;
    let active = true; let timer = 0; let controller: AbortController | null = null;
    const runGeneration = generation.current;
    const schedule = () => { timer = window.setTimeout(syncLatest, klinePollingDelay(interval, document.hidden)); };
    const syncLatest = async () => {
      controller?.abort(); controller = new AbortController();
      try {
        setRequestCount((count) => count + 1);
        setIncrementalRequestCount((count) => count + 1);
        const response = await fetch(`/api/market/kline?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}&interval=${interval}&limit=5`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("K线增量请求失败");
        const loaded = await response.json() as KlineResult;
        if (!active || generation.current !== runGeneration) return;
        if (!loaded.candles.length) { setRealtimeInterrupted(true); return; }
        const state = cache.mergeIncremental(chain, address, interval, loaded);
        if (state) setResult({ candles: state.mergedBars, source: state.source, reason: state.reason });
        setRealtimeInterrupted(false);
      } catch (error) { if (active && !(error instanceof DOMException && error.name === "AbortError")) setRealtimeInterrupted(true); }
      if (active) schedule();
    };
    const visibility = () => { window.clearTimeout(timer); if (!document.hidden) void syncLatest(); else schedule(); };
    schedule(); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [cache, chain, address, interval, historyLoaded]);

  return <div data-kline-request-count={requestCount} data-kline-full-request-count={fullRequestCount} data-kline-incremental-request-count={incrementalRequestCount} data-kline-bar-count={result.candles.length} data-kline-history-loaded={historyLoaded} data-kline-mode="history-plus-incremental-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">价格K线</h2><p className="mt-1 text-xs text-slate-500">北京时间 · {KLINE_META[interval].label} · {KLINE_META[interval].window}</p></div><div className="flex min-w-0 flex-col gap-2 sm:items-end"><div className="flex max-w-full flex-wrap rounded-lg border border-white/[0.1] bg-[#070b11] p-1" role="group" aria-label="K线周期">{KLINE_INTERVALS.map((value) => <button key={value} type="button" onClick={() => void selectInterval(value)} className={`rounded-md px-2.5 py-1.5 text-xs transition ${interval === value ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}>{KLINE_META[value].label}</button>)}</div><span className="text-xs text-slate-500">{loading ? "正在获取…" : result.source || "暂无数据源"}</span></div></div>
    {realtimeInterrupted && result.candles.length > 0 ? <p className="mt-2 text-xs text-amber-300">实时更新暂时中断，已保留完整历史图表。</p> : result.candles.length > 0 ? <p className="mt-2 text-xs text-emerald-300/80">实时 · 已加载 {result.candles.length} 根，增量同步最近 5 根</p> : null}
    {loading ? <div className="mt-4 grid h-64 place-items-center rounded-xl border border-white/[0.06] text-sm text-slate-500">加载对应周期数据…</div> : result.candles.length ? <Chart data={result.candles} interval={interval}/> : <div className="mt-4 grid h-64 place-items-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm leading-6 text-slate-400">{result.reason || "该数据源暂未收录"}</div>}
  </div>;
}
