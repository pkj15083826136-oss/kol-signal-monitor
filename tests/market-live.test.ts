import { describe, expect, it } from "vitest";
import { direction, isMarketStale, mergeMarket, pollingDelay, retainLastAvailable } from "@/lib/market-live";

const item = { chain: "base", address: "0x1234567890", price: 1, marketCap: 10, liquidity: 5, volume24h: 8, updatedAt: "2026-09-19T00:00:00.000Z", source: "DexScreener" };

describe("live market behavior", () => {
  it("uses 3 seconds in foreground and 15 seconds when hidden", () => {
    expect(pollingDelay(false)).toBe(3000); expect(pollingDelay(true)).toBe(15000);
  });
  it("tracks every metric using its own direction", () => {
    const next = mergeMarket(item, { ...item, price: 2, marketCap: 9, liquidity: 5, volume24h: 12 });
    expect(next.directions).toEqual({ price: "up", marketCap: "down", liquidity: "same", volume24h: "up" });
    expect(direction(undefined, 1)).toBe("same");
  });
  it("marks quotes older than 30 seconds stale", () => {
    expect(isMarketStale(item.updatedAt, new Date(item.updatedAt).getTime() + 30_001)).toBe(true);
  });
  it("retains the last real quote when an upstream poll is temporarily unavailable", () => {
    expect(retainLastAvailable(item, { ...item, price: 0, source: "unavailable", updatedAt: "2026-09-19T00:01:00.000Z" })).toBe(item);
  });
});
