import type { BatchMarketItem } from "@/lib/batch-market";

export type MarketDirection = "up" | "down" | "same";
export type LiveMarketItem = BatchMarketItem & { directions: { price: MarketDirection; marketCap: MarketDirection; liquidity: MarketDirection; holders: MarketDirection; volume24h: MarketDirection } };

export function pollingDelay(hidden: boolean) { return hidden ? 15_000 : 3_000; }
export function marketKey(chain: string, address: string) { return `${chain}:${address.toLowerCase()}`; }
export function direction(previous: number | undefined, next: number): MarketDirection {
  if (previous === undefined || previous === next) return "same";
  return next > previous ? "up" : "down";
}
export function mergeMarket(previous: BatchMarketItem | undefined, next: BatchMarketItem): LiveMarketItem {
  return { ...next, directions: {
    price: direction(previous?.price, next.price), marketCap: direction(previous?.marketCap, next.marketCap),
    liquidity: direction(previous?.liquidity, next.liquidity), holders: direction(previous?.holders, next.holders), volume24h: direction(previous?.volume24h, next.volume24h),
  } };
}
export function retainLastAvailable(previous: BatchMarketItem | undefined, next: BatchMarketItem): BatchMarketItem {
  return next.source === "unavailable" && previous && previous.source !== "unavailable" ? previous : next;
}
export function isMarketStale(updatedAt: string, now = Date.now()) { return now - new Date(updatedAt).getTime() > 30_000; }
