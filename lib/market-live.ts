import { tokenAddressEquals } from "@/lib/token-market";
import type { BatchMarketItem, SnapshotField } from "@/lib/batch-market";

export type MarketDirection = "up" | "down" | "same";
export type LiveMarketItem = BatchMarketItem & { directions: { price: MarketDirection; marketCap: MarketDirection; liquidity: MarketDirection; holders: MarketDirection; volume24h: MarketDirection } };

export const MARKET_FIELD_TTL_MS: Record<SnapshotField, number> = { price: 30_000, priceChange24h: 120_000, liquidity: 120_000, volume24h: 120_000, marketCap: 300_000, holders: 900_000 };
export function pollingDelay(hidden: boolean) { return hidden ? 15_000 : 3_000; }
export function marketKey(chain: string, address: string) { return `${chain}:${chain === "sol" ? address : address.toLowerCase()}`; }
export function persistedMarketSnapshot(input: { chain: string; address: string; price: number; marketCap: number; liquidity: number; volume24h: number; holders: number | null; capturedAt: string }): BatchMarketItem {
  const supplied = {
    ...(input.price > 0 ? { price: "signal" } : {}),
    ...(input.marketCap > 0 ? { marketCap: "signal" } : {}),
    ...(input.liquidity > 0 ? { liquidity: "signal" } : {}),
    ...(input.volume24h > 0 ? { volume24h: "signal" } : {}),
    ...(input.holders !== null && input.holders > 0 ? { holders: "signal" } : {}),
  };
  return {
    chain: input.chain, address: input.address, tokenAddress: input.address, pairAddress: "", symbol: "", decimals: null,
    price: input.price > 0 ? input.price : 0, priceChange24h: null, marketCap: input.marketCap > 0 ? input.marketCap : 0,
    liquidity: input.liquidity > 0 ? input.liquidity : 0, volume24h: input.volume24h > 0 ? input.volume24h : 0,
    holders: input.holders !== null && input.holders > 0 ? input.holders : null, updatedAt: input.capturedAt, sourceTimestamp: input.capturedAt,
    receivedAt: input.capturedAt, source: "cached:signal", identityVerified: true, fieldSources: supplied, fieldUpdatedAt: Object.fromEntries(Object.keys(supplied).map((field) => [field, input.capturedAt])), staleFields: [], conflictFields: [],
  };
}
export function direction(previous: number | null | undefined, next: number | null): MarketDirection {
  if (previous === undefined || previous === null || next === null || previous === next) return "same";
  return next > previous ? "up" : "down";
}
function fieldIsSupplied(item: BatchMarketItem, field: SnapshotField) {
  if (item.fieldSources?.[field]) return true;
  const value = item[field];
  return value !== null && value !== undefined && (field === "priceChange24h" || field === "holders" ? Number.isFinite(value) : value > 0);
}
export function mergeSnapshot(previous: BatchMarketItem | undefined, incoming: BatchMarketItem, now = Date.now()): BatchMarketItem {
  if (!previous) return incoming;
  const tokenAddress = incoming.tokenAddress || incoming.address;
  if (incoming.chain !== previous.chain || !tokenAddressEquals(incoming.chain, tokenAddress, previous.tokenAddress || previous.address) || incoming.identityVerified === false) return previous;
  if (Date.parse(incoming.receivedAt || incoming.updatedAt) < Date.parse(previous.receivedAt || previous.updatedAt)) return previous;
  const next = { ...previous, ...incoming, fieldSources: { ...previous.fieldSources }, fieldUpdatedAt: { ...previous.fieldUpdatedAt }, staleFields: [...(previous.staleFields || [])], conflictFields: [...new Set([...(previous.conflictFields || []), ...(incoming.conflictFields || [])])] };
  for (const field of Object.keys(MARKET_FIELD_TTL_MS) as SnapshotField[]) {
    if (fieldIsSupplied(incoming, field)) {
      Object.assign(next, { [field]: incoming[field] });
      if (incoming.fieldSources?.[field]) next.fieldSources[field] = incoming.fieldSources[field];
      next.fieldUpdatedAt[field] = incoming.fieldUpdatedAt?.[field] || incoming.sourceTimestamp || incoming.updatedAt;
    } else Object.assign(next, { [field]: previous[field] });
  }
  next.staleFields = (Object.keys(MARKET_FIELD_TTL_MS) as SnapshotField[]).filter((field) => { const stamp = next.fieldUpdatedAt?.[field]; return Boolean(stamp) && now - Date.parse(stamp!) > MARKET_FIELD_TTL_MS[field]; });
  if (incoming.source === "unavailable" && previous.source !== "unavailable") {
    next.source = previous.source.startsWith("cached:") ? previous.source : `cached:${previous.source}`;
    next.updatedAt = previous.updatedAt;
    next.sourceTimestamp = previous.sourceTimestamp;
  }
  return next;
}
export function mergeMarket(previous: BatchMarketItem | undefined, incoming: BatchMarketItem): LiveMarketItem {
  const next = mergeSnapshot(previous, incoming);
  return { ...next, directions: {
    price: direction(previous?.price, next.price), marketCap: direction(previous?.marketCap, next.marketCap),
    liquidity: direction(previous?.liquidity, next.liquidity), holders: direction(previous?.holders, next.holders), volume24h: direction(previous?.volume24h, next.volume24h),
  } };
}
export function retainLastAvailable(previous: BatchMarketItem | undefined, next: BatchMarketItem): BatchMarketItem { return mergeSnapshot(previous, next); }
export function isMarketStale(updatedAt: string, now = Date.now()) { return now - new Date(updatedAt).getTime() > 30_000; }
