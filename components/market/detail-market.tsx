"use client";

import KlineChart from "@/app/signal/[id]/kline-chart";
import type { KlineResult } from "@/lib/market";
import type { BatchMarketItem } from "@/lib/batch-market";
import { isMarketStale, marketKey, type MarketDirection } from "@/lib/market-live";
import { formatShanghaiTime, formatTokenPrice, formatUsdCompact } from "@/lib/market-format";
import { useLiveMarket } from "@/lib/use-live-market";

function tone(direction?: MarketDirection) { return direction === "up" ? "text-emerald-300" : direction === "down" ? "text-rose-300" : "text-slate-100"; }
function Box({ label, value, direction }: { label: string; value: string; direction?: MarketDirection }) { return <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5"><div className="truncate text-[11px] text-slate-500">{label}</div><div className={`mt-1 truncate text-sm font-medium ${tone(direction)}`}>{value}</div></div>; }

export default function DetailMarket({ chain, address, initial, initialFifteen, enabled }: { chain: string; address: string; initial: BatchMarketItem; initialFifteen: KlineResult; enabled: boolean }) {
  const { items, degraded } = useLiveMarket([{ chain, address }], enabled, [initial]);
  const live = items[marketKey(chain, address)] || { ...initial, directions: { price: "same", marketCap: "same", liquidity: "same", holders: "same", volume24h: "same" } } as const;
  const available = live.source !== "unavailable";
  const stale = isMarketStale(live.updatedAt);
  const status = !available ? "数据源不可用" : stale ? "行情延迟" : `北京时间 ${formatShanghaiTime(live.updatedAt)}`;
  const money = (value: number) => available ? formatUsdCompact(value) : "--";
  return <>
    <div className="mt-5 min-w-0 max-w-full"><div data-testid="live-market-grid" className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-5"><Box label="价格" value={available ? formatTokenPrice(live.price) : "--"} direction={live.directions.price}/><Box label={live.marketCapKind === "fdv" ? "FDV" : "市值"} value={money(live.marketCap)} direction={live.directions.marketCap}/><Box label="流动性" value={money(live.liquidity)} direction={live.directions.liquidity}/><Box label="24H交易额" value={money(live.volume24h)} direction={live.directions.volume24h}/><Box label="持币地址" value={available && live.holders !== null ? live.holders.toLocaleString() : "--"} direction={live.directions.holders}/></div><p className={`mt-1.5 text-right text-[10px] ${stale || degraded || !available || live.marketDataConflict ? "text-amber-300" : "text-slate-500"}`}>{live.marketDataConflict ? "行情口径冲突 · " : ""}{enabled ? status : "动态行情未启用"}{degraded && available ? " · 部分数据源降级" : ""}{live.holderUpdatedAt && isMarketStale(live.holderUpdatedAt) ? " · 持币数据延迟" : ""}</p></div>
    <section className="mt-4 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b1018]/95 p-4 sm:p-5"><KlineChart chain={chain} address={address} initialFifteen={initialFifteen}/></section>
  </>;
}
