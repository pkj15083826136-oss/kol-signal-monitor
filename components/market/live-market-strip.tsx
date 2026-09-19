"use client";

import { useLiveMarket } from "@/lib/use-live-market";
import { isMarketStale, marketKey, type MarketDirection } from "@/lib/market-live";

function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: value < 1 ? 8 : 2 }).format(value || 0); }
function tone(direction?: MarketDirection) { return direction === "up" ? "text-emerald-300" : direction === "down" ? "text-red-300" : "text-slate-200"; }

export default function LiveMarketStrip({ chain, address, initial }: { chain: string; address: string; initial: { price: number; marketCap: number; liquidity: number; volume24h: number } }) {
  const { items, degraded } = useLiveMarket([{ chain, address }]);
  const live = items[marketKey(chain, address)];
  const values = live || { ...initial, directions: {} };
  const stale = live ? isMarketStale(live.updatedAt) : false;
  return <div className="mt-7"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Box label="价格" value={money(values.price)} className={tone(live?.directions.price)}/><Box label="市值" value={money(values.marketCap)} className={tone(live?.directions.marketCap)}/><Box label="流动性" value={money(values.liquidity)} className={tone(live?.directions.liquidity)}/><Box label="24H交易额" value={money(values.volume24h)} className={tone(live?.directions.volume24h)}/></div><p className={`mt-2 text-right text-[11px] ${stale || degraded ? "text-amber-300" : "text-slate-600"}`}>{live ? `北京时间 ${new Date(live.updatedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}` : "等待动态行情"}{stale ? " · 数据陈旧" : degraded ? " · 数据源降级" : ""}</p></div>;
}
function Box({ label, value, className }: { label: string; value: string; className: string }) { return <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-xs text-slate-600">{label}</div><div className={`mt-2 truncate font-medium ${className}`}>{value}</div></div>; }
