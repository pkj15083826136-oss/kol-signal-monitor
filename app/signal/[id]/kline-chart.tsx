"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import type { Candle, KlineResult } from "@/lib/market";
import { KLINE_INTERVALS, KLINE_META, KlineCache, klinePollingDelay, mergeCandles, type KlineInterval } from "@/lib/kline";

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
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#34d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#fb7185" });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#334155" });
    candleSeries.current = candles; volumeSeries.current = volume;
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    return () => { candleSeries.current = null; volumeSeries.current = null; chart.remove(); };
  }, [interval]);
  useEffect(() => {
    if (!data.length || !candleSeries.current || !volumeSeries.current) return;
    candleSeries.current.setData(data.map((item) => ({ time: item.time as UTCTimestamp, open: item.open, high: item.high, low: item.low, close: item.close })));
    volumeSeries.current.setData(data.map((item) => ({ time: item.time as UTCTimestamp, value: item.volume, color: item.close >= item.open ? "#34d39955" : "#fb718555" })));
  }, [data]);
  return <div className="mt-4 min-h-[330px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#080c12]" ref={target} role="img" aria-label={`${KLINE_META[interval].label}K线图`}/>;
}

export default function KlineChart({ chain, address, initialFifteen }: { chain: string; address: string; initialFifteen: KlineResult }) {
  const cache = useRef(new KlineCache({ 15: initialFifteen }));
  const [interval, setInterval] = useState<KlineInterval>(15);
  const [result, setResult] = useState(initialFifteen);
  const [loading, setLoading] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [realtimeInterrupted, setRealtimeInterrupted] = useState(false);
  const generation = useRef(0);

  async function selectInterval(next: KlineInterval) {
    const requestGeneration = ++generation.current;
    setInterval(next);
    const cached = cache.current.get(next);
    if (cached) { setResult(cached); return; }
    setLoading(true);
    setRequestCount((count) => count + 1);
    try {
      const response = await fetch(`/api/market/kline?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}&interval=${next}`, { cache: "no-store" });
      if (!response.ok) throw new Error("K线请求失败");
      const loaded = await response.json() as KlineResult;
      if (generation.current !== requestGeneration) return;
      cache.current.set(next, loaded);
      setResult(loaded);
    } catch {
      const failed = { candles: [], source: "", reason: "该链暂不支持此周期，或数据源请求失败。" };
      cache.current.set(next, failed);
      if (generation.current === requestGeneration) setResult(failed);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true; let timer = 0; let controller: AbortController | null = null;
    const runGeneration = generation.current;
    const schedule = () => { timer = window.setTimeout(syncLatest, klinePollingDelay(interval, document.hidden)); };
    const syncLatest = async () => {
      controller?.abort(); controller = new AbortController();
      try {
        setRequestCount((count) => count + 1);
        const response = await fetch(`/api/market/kline?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}&interval=${interval}&limit=5`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("K线增量请求失败");
        const loaded = await response.json() as KlineResult;
        if (!active || generation.current !== runGeneration) return;
        setResult((current) => { const merged = mergeCandles(current, loaded); cache.current.set(interval, merged); return merged; });
        setRealtimeInterrupted(false);
      } catch (error) { if (active && !(error instanceof DOMException && error.name === "AbortError")) setRealtimeInterrupted(true); }
      if (active) schedule();
    };
    const visibility = () => { window.clearTimeout(timer); if (!document.hidden) void syncLatest(); else schedule(); };
    schedule(); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [chain, address, interval]);

  return <div data-kline-request-count={requestCount} data-kline-mode="incremental-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">价格K线</h2><p className="mt-1 text-xs text-slate-500">北京时间 · {KLINE_META[interval].label} · {KLINE_META[interval].window}</p></div><div className="flex min-w-0 flex-col gap-2 sm:items-end"><div className="flex max-w-full flex-wrap rounded-lg border border-white/[0.1] bg-[#070b11] p-1" role="group" aria-label="K线周期">{KLINE_INTERVALS.map((value) => <button key={value} type="button" onClick={() => void selectInterval(value)} className={`rounded-md px-2.5 py-1.5 text-xs transition ${interval === value ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}>{KLINE_META[value].label}</button>)}</div><span className="text-xs text-slate-500">{loading ? "正在获取…" : result.source || "暂无数据源"}</span></div></div>
    {realtimeInterrupted && result.candles.length > 0 ? <p className="mt-2 text-xs text-amber-300">实时更新暂时中断，已保留现有图表。</p> : result.candles.length > 0 ? <p className="mt-2 text-xs text-emerald-300/80">实时 · 仅增量同步最近 5 根</p> : null}
    {loading ? <div className="mt-4 grid h-64 place-items-center rounded-xl border border-white/[0.06] text-sm text-slate-500">加载对应周期数据…</div> : result.candles.length ? <Chart data={result.candles} interval={interval}/> : <div className="mt-4 grid h-64 place-items-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm leading-6 text-slate-400">{result.reason || "该链暂不支持此周期"}</div>}
  </div>;
}
