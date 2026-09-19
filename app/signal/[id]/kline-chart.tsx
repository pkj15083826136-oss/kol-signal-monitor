"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type Time, type UTCTimestamp } from "lightweight-charts";
import type { Candle, KlineResult } from "@/lib/market";

function Chart({ data, interval }: { data: Candle[]; interval: 5 | 15 }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target.current || !data.length) return;
    const chart = createChart(target.current, {
      height: 330, autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#080c12" }, textColor: "#64748b", attributionLogo: false },
      grid: { vertLines: { color: "#ffffff08" }, horzLines: { color: "#ffffff0d" } },
      rightPriceScale: { borderColor: "#ffffff12" }, timeScale: { borderColor: "#ffffff12", timeVisible: true, secondsVisible: false },
      localization: { timeFormatter: (time: Time) => new Date(Number(time) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#34d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#fb7185" });
    candles.setData(data.map((item) => ({ time: item.time as UTCTimestamp, open: item.open, high: item.high, low: item.low, close: item.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#334155" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(data.map((item) => ({ time: item.time as UTCTimestamp, value: item.volume, color: item.close >= item.open ? "#34d39955" : "#fb718555" })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, interval]);
  return <div className="mt-4 min-h-[330px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#080c12]" ref={target} role="img" aria-label={`${interval}分钟K线图`}/>;
}

export default function KlineChart({ five, fifteen }: { five: KlineResult; fifteen: KlineResult }) {
  const [interval, setInterval] = useState<5 | 15>(15);
  const result = interval === 5 ? five : fifteen;
  return <><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">价格K线</h2><p className="mt-1 text-xs text-slate-600">北京时间 · {interval}分钟 · 最近约{interval === 5 ? 10 : 30}小时</p></div><div className="flex items-center gap-3"><div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-1" role="group" aria-label="K线周期"><button type="button" onClick={() => setInterval(5)} className={`rounded-md px-3 py-1.5 text-xs transition ${interval === 5 ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>5分钟</button><button type="button" onClick={() => setInterval(15)} className={`rounded-md px-3 py-1.5 text-xs transition ${interval === 15 ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>15分钟</button></div><span className="text-xs text-slate-600">{result.source || "暂无数据源"}</span></div></div>{result.candles.length ? <Chart data={result.candles} interval={interval}/> : <div className="mt-4 grid h-64 place-items-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm leading-6 text-slate-500">{result.reason}</div>}</>;
}
