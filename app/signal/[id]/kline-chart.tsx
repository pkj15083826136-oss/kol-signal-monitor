"use client";

import { useState } from "react";
import type { Candle, KlineResult } from "@/lib/market";

function compactPrice(value: number) {
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toPrecision(4);
}

function Chart({ data, interval }: { data: Candle[]; interval: 5 | 15 }) {
  const width = 960, height = 330, top = 22, bottom = 34, left = 12, right = 72;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const visible = data.slice(-120);
  if (!visible.length) return <div className="grid h-72 place-items-center text-sm text-slate-600">暂未获取到该链的K线数据</div>;
  const min = Math.min(...visible.map((c) => c.low));
  const max = Math.max(...visible.map((c) => c.high));
  const range = max - min || max || 1;
  const y = (value: number) => top + (max - value) / range * plotHeight;
  const step = plotWidth / visible.length;
  const bodyWidth = Math.max(1.5, Math.min(6, step * 0.62));
  const grid = Array.from({ length: 5 }, (_, index) => max - range * index / 4);
  return <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-[#080c12]">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${interval}分钟K线图`} className="block h-auto min-h-[260px] w-full">
      {grid.map((value) => <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#ffffff0d"/><text x={width-right+9} y={y(value)+4} fill="#526070" fontSize="11">{compactPrice(value)}</text></g>)}
      {visible.map((candle, index) => { const x = left + (index + .5) * step; const up = candle.close >= candle.open; const color = up ? "#34d399" : "#fb7185"; const bodyTop = y(Math.max(candle.open, candle.close)); const bodyHeight = Math.max(1, Math.abs(y(candle.open)-y(candle.close))); return <g key={`${candle.time}-${index}`}><line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1"/><rect x={x-bodyWidth/2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx=".5" fill={color}/></g>; })}
      {[0, .25, .5, .75, 1].map((ratio) => { const item = visible[Math.min(visible.length-1, Math.floor((visible.length-1)*ratio))]; return <text key={ratio} x={left+plotWidth*ratio} y={height-11} textAnchor={ratio===0?"start":ratio===1?"end":"middle"} fill="#526070" fontSize="11">{new Date(item.time*1000).toLocaleTimeString("zh-CN", {timeZone:"Asia/Shanghai", hour:"2-digit", minute:"2-digit", hour12:false})}</text>; })}
    </svg>
  </div>;
}

export default function KlineChart({ five, fifteen }: { five: KlineResult; fifteen: KlineResult }) {
  const [interval, setInterval] = useState<5 | 15>(15);
  const result = interval === 5 ? five : fifteen;
  return <><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">价格K线</h2><p className="mt-1 text-xs text-slate-600">北京时间 · {interval}分钟 · 最近约{interval === 5 ? 10 : 30}小时</p></div><div className="flex items-center gap-3"><div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-1" role="group" aria-label="K线周期"><button type="button" onClick={() => setInterval(5)} className={`rounded-md px-3 py-1.5 text-xs transition ${interval === 5 ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>5分钟</button><button type="button" onClick={() => setInterval(15)} className={`rounded-md px-3 py-1.5 text-xs transition ${interval === 15 ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>15分钟</button></div><span className="text-xs text-slate-600">{result.source || "暂无数据源"}</span></div></div>{result.candles.length ? <Chart data={result.candles} interval={interval}/> : <div className="mt-4 grid h-64 place-items-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm leading-6 text-slate-500">{result.reason}</div>}</>;
}
