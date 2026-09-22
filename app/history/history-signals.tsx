"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import type { SignalRow } from "@/app/dashboard";
import { chainLabel } from "@/lib/chains";
import { formatShanghaiDateTime, formatUsdCompact } from "@/lib/market-format";

export default function HistorySignals() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ history: "1" });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/signals?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { signals: SignalRow[]; nextCursor: string | null };
        setRows(payload.signals); setCursor(payload.nextCursor);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setRows([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  async function loadMore() {
    if (loading || !cursor) return; setLoading(true);
    try { const params = new URLSearchParams({ history: "1", cursor }); if (query.trim()) params.set("q", query.trim()); const response = await fetch(`/api/signals?${params}`, { cache: "no-store" }); const payload = await response.json() as { signals: SignalRow[]; nextCursor: string | null }; setRows((current) => [...current, ...payload.signals.filter((row) => !current.some((item) => item.id === row.id))]); setCursor(payload.nextCursor); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen overflow-x-hidden bg-[#070a0f] text-slate-100">
    <header className="border-b border-white/10"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4"><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-300"><ChevronLeft size={17}/>KOL Signal</Link><span className="text-sm text-slate-500">历史信号</span></div></header>
    <div className="mx-auto max-w-5xl px-4 py-6"><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1018] px-3"><Search size={16} className="text-slate-600"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索历史名称、简称或合约"/></label>
      <div className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 bg-[#0b1018]">{rows.map((row) => <Link key={row.id} href={`/signal/${row.id}`} className="grid min-w-0 gap-2 p-4 hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto]"><div className="min-w-0"><div className="truncate font-medium">{row.symbol} <span className="text-xs text-slate-500">{chainLabel(row.chain)}</span></div><div className="mt-1 truncate font-mono text-xs text-slate-600">{row.tokenAddress}</div></div><div className="text-sm text-slate-400">{formatUsdCompact(row.marketCap)}</div><div className="text-xs text-slate-600">{formatShanghaiDateTime(row.createdAt)}</div></Link>)}{!rows.length && !loading ? <div className="p-12 text-center text-sm text-slate-500">没有历史记录</div> : null}</div>
      <button type="button" disabled={loading || !cursor} onClick={() => void loadMore()} className="mt-4 w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400 disabled:opacity-50">{loading ? "加载中…" : cursor ? "加载更多" : "已到底"}</button>
    </div>
  </main>;
}
