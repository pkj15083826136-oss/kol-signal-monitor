"use client";

import { useLiveMarket } from "@/lib/use-live-market";
import { isMarketStale, marketKey, type MarketDirection } from "@/lib/market-live";

function money(value: number | undefined, available: boolean) { return available && value && value > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: value < 1 ? 8 : 2 }).format(value) : "暂无数据"; }
function tone(direction?: MarketDirection) { return direction === "up" ? "text-emerald-300" : direction === "down" ? "text-red-300" : "text-slate-200"; }

export default function LiveMarketStrip({ chain, address, initial, enabled }: { chain: string; address: string; initial: { price: number; marketCap: number; liquidity: number; volume24h: number }; enabled: boolean }) {
  const { items, degraded } = useLiveMarket([{ chain, address }], enabled);
  const live = items[marketKey(chain, address)];
  const available = live ? live.source !== "unavailable" : Object.values(initial).some((value) => value > 0);
  const values = live || { ...initial, directions: {} };
  const stale = live ? isMarketStale(live.updatedAt) : false;
  const status = live ? (available ? `北京时间 ${new Date(live.updatedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}` : "数据源不可用") : enabled ? "等待动态行情" : "动态行情未启用";
  return <div className="mt-7 min-w-0 max-w-full"><div data-testid="live-market-grid" className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:grid-cols-4"><Box label="价格" value={money(values.price, available)} className={tone(live?.directions.price)}/><Box label="市值" value={money(values.marketCap, available)} className={tone(live?.directions.marketCap)}/><Box label="流动性" value={money(values.liquidity, available)} className={tone(live?.directions.liquidity)}/><Box label="24H交易额" value={money(values.volume24h, available)} className={tone(live?.directions.volume24h)}/></div><p className={`mt-2 text-right text-[11px] ${stale || degraded || !available ? "text-amber-300" : "text-slate-600"}`}>{status}{stale ? " · 数据陈旧" : degraded && available ? " · 数据源降级" : ""}</p></div>;
}
function Box({ label, value, className }: { label: string; value: string; className: string }) { return <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-4 sm:p-4"><div className="truncate text-xs text-slate-600">{label}</div><div className={`mt-2 truncate font-medium ${className}`}>{value}</div></div>; }
