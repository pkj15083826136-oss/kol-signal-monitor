"use client";
import { ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendSeriesPoint } from "@/lib/trend-window";

function compactToken(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function shanghaiTime(value: number, includeDate = false) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...(includeDate ? { month: "2-digit", day: "2-digit" } : {}), hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

export default function SignalChart({ data, series, domain }: { data: Array<{ time: number; holders: number | null; value: number | null; amount: number | null }>; series: { holders: TrendSeriesPoint[]; amount: TrendSeriesPoint[]; value: TrendSeriesPoint[] }; domain: [number, number] }) {
  return <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 15, right: 10, left: -16, bottom: 0 }}>
    <CartesianGrid stroke="#ffffff0c" vertical={false}/><XAxis dataKey="time" type="number" scale="time" domain={domain} stroke="#526070" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => shanghaiTime(Number(value))}/><YAxis yAxisId="holders" stroke="#526070" tickLine={false} axisLine={false} fontSize={11}/><YAxis yAxisId="value" orientation="right" stroke="#526070" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `$${Math.round(v/1000)}K`}/><YAxis yAxisId="amount" hide domain={["dataMin", "dataMax"]}/>
    <Tooltip labelFormatter={(value) => `北京时间 ${shanghaiTime(Number(value), true)}`} contentStyle={{ background: "#0b1018", border: "1px solid #ffffff14", borderRadius: 12, color: "#dbe7f0" }} formatter={(value, name) => { if (name === "持仓价值") return [`$${Number(value).toLocaleString()}`, name]; if (name === "代币数量") return [compactToken(Number(value)), name]; return [`${value}人`, name]; }}/>
    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}/>
    <Line data={series.holders} yAxisId="holders" type="stepAfter" dataKey="value" name="KOL人数" connectNulls={false} stroke="#67e8f9" strokeWidth={2} dot={false}/>
    <Line data={series.value} yAxisId="value" type="monotone" dataKey="value" name="持仓价值" connectNulls={false} stroke="#a78bfa" strokeWidth={2} dot={false}/>
    <Line data={series.amount} yAxisId="amount" type="stepAfter" dataKey="value" name="代币数量" connectNulls={false} stroke="#fbbf24" strokeWidth={2.2} dot={false}/>
  </ComposedChart></ResponsiveContainer></div>;
}
