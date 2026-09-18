"use client";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function compactToken(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export default function SignalChart({ data }: { data: Array<{ time: string; holders: number; value: number; amount: number }> }) {
  return <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 15, right: 10, left: -16, bottom: 0 }}><defs><linearGradient id="holders" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#67e8f9" stopOpacity={0.34}/><stop offset="100%" stopColor="#67e8f9" stopOpacity={0}/></linearGradient><linearGradient id="value" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.24}/><stop offset="100%" stopColor="#a78bfa" stopOpacity={0}/></linearGradient></defs>
    <CartesianGrid stroke="#ffffff0c" vertical={false}/><XAxis dataKey="time" stroke="#526070" tickLine={false} axisLine={false} fontSize={11}/><YAxis yAxisId="holders" stroke="#526070" tickLine={false} axisLine={false} fontSize={11}/><YAxis yAxisId="value" orientation="right" stroke="#526070" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `$${Math.round(v/1000)}K`}/><YAxis yAxisId="amount" hide domain={["dataMin", "dataMax"]}/>
    <Tooltip contentStyle={{ background: "#0b1018", border: "1px solid #ffffff14", borderRadius: 12, color: "#dbe7f0" }} formatter={(value, name) => { if (name === "持仓价值") return [`$${Number(value).toLocaleString()}`, name]; if (name === "代币数量") return [compactToken(Number(value)), name]; return [`${value}人`, name]; }}/>
    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}/>
    <Area yAxisId="holders" type="monotone" dataKey="holders" name="持仓人数" stroke="#67e8f9" fill="url(#holders)" strokeWidth={2}/>
    <Area yAxisId="value" type="monotone" dataKey="value" name="持仓价值" stroke="#a78bfa" fill="url(#value)" strokeWidth={2}/>
    <Line yAxisId="amount" type="monotone" dataKey="amount" name="代币数量" stroke="#fbbf24" strokeWidth={2.2} dot={false}/>
  </AreaChart></ResponsiveContainer></div>;
}
