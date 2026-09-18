import type { Candle } from "@/lib/market";

function compactPrice(value: number) {
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toPrecision(4);
}

export default function KlineChart({ data }: { data: Candle[] }) {
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
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="5分钟K线图" className="block h-auto min-h-[260px] w-full">
      {grid.map((value) => <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#ffffff0d"/><text x={width-right+9} y={y(value)+4} fill="#526070" fontSize="11">{compactPrice(value)}</text></g>)}
      {visible.map((candle, index) => { const x = left + (index + .5) * step; const up = candle.close >= candle.open; const color = up ? "#34d399" : "#fb7185"; const bodyTop = y(Math.max(candle.open, candle.close)); const bodyHeight = Math.max(1, Math.abs(y(candle.open)-y(candle.close))); return <g key={`${candle.time}-${index}`}><line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1"/><rect x={x-bodyWidth/2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx=".5" fill={color}/></g>; })}
      {[0, .25, .5, .75, 1].map((ratio) => { const item = visible[Math.min(visible.length-1, Math.floor((visible.length-1)*ratio))]; return <text key={ratio} x={left+plotWidth*ratio} y={height-11} textAnchor={ratio===0?"start":ratio===1?"end":"middle"} fill="#526070" fontSize="11">{new Date(item.time*1000).toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit"})}</text>; })}
    </svg>
  </div>;
}
