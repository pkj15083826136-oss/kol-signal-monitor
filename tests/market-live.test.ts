import { describe, expect, it } from "vitest";
import { direction, isMarketStale, marketKey, mergeMarket, mergeSnapshot, pollingDelay, retainLastAvailable } from "@/lib/market-live";
import type { BatchMarketItem } from "@/lib/batch-market";

const item: BatchMarketItem = { chain: "base", address: "0x1234567890", tokenAddress: "0x1234567890", pairAddress: "0xpair", symbol: "TEST", decimals: 18, price: 1, priceChange24h: 2, marketCap: 10, liquidity: 5, holders: 100, volume24h: 8, updatedAt: "2026-09-19T00:00:00.000Z", sourceTimestamp: "2026-09-19T00:00:00.000Z", receivedAt: "2026-09-19T00:00:01.000Z", source: "Ave.ai", identityVerified: true, fieldSources: { price: "ave", priceChange24h: "ave", marketCap: "ave", liquidity: "ave", holders: "ave", volume24h: "ave" }, fieldUpdatedAt: { price: "2026-09-19T00:00:00.000Z", priceChange24h: "2026-09-19T00:00:00.000Z", marketCap: "2026-09-19T00:00:00.000Z", liquidity: "2026-09-19T00:00:00.000Z", holders: "2026-09-19T00:00:00.000Z", volume24h: "2026-09-19T00:00:00.000Z" }, staleFields: [], conflictFields: [] };

describe("live market behavior", () => {
  it("uses 3 seconds in foreground and 15 seconds when hidden", () => {
    expect(pollingDelay(false)).toBe(3000); expect(pollingDelay(true)).toBe(15000);
  });
  it("tracks every metric using its own direction", () => {
    const next = mergeMarket(item, { ...item, price: 2, marketCap: 9, liquidity: 5, holders: 99, volume24h: 12 });
    expect(next.directions).toEqual({ price: "up", marketCap: "down", liquidity: "same", holders: "down", volume24h: "up" });
    expect(direction(undefined, 1)).toBe("same");
  });
  it("marks quotes older than 30 seconds stale", () => {
    expect(isMarketStale(item.updatedAt, new Date(item.updatedAt).getTime() + 30_001)).toBe(true);
  });
  it("retains the last real quote when an upstream poll is temporarily unavailable", () => {
    const result = retainLastAvailable(item, { ...item, price: 0, source: "unavailable", identityVerified: false, updatedAt: "2026-09-19T00:01:00.000Z", receivedAt: "2026-09-19T00:01:00.000Z", fieldSources: {} });
    expect(result).toBe(item);
  });
  it("never turns an unavailable first response into fixture data", () => {
    const unavailable = { ...item, price: 0, marketCap: 0, liquidity: 0, holders: 0, volume24h: 0, source: "unavailable" };
    expect(retainLastAvailable(undefined, unavailable)).toEqual(unavailable);
  });
  it("merges partial refreshes field by field without erasing market cap or holders", () => {
    const partial = { ...item, price: 1.1, marketCap: 0, holders: null, receivedAt: "2026-09-19T00:00:02.000Z", fieldSources: { price: "ave" }, fieldUpdatedAt: { price: "2026-09-19T00:00:02.000Z" } };
    const result = mergeSnapshot(item, partial);
    expect(result).toMatchObject({ price: 1.1, marketCap: 10, holders: 100 });
  });
  it("does not allow older, wrong-token, pair-address or wrong-case Solana responses to overwrite", () => {
    expect(mergeSnapshot(item, { ...item, price: 99, receivedAt: "2026-09-18T23:59:00.000Z" }).price).toBe(1);
    expect(mergeSnapshot(item, { ...item, tokenAddress: "0xpair", price: 99, receivedAt: "2026-09-19T00:00:02.000Z" }).price).toBe(1);
    const sol = { ...item, chain: "sol", address: "AbCdEf12345", tokenAddress: "AbCdEf12345" };
    expect(mergeSnapshot(sol, { ...sol, tokenAddress: "abcdef12345", price: 99, receivedAt: "2026-09-19T00:00:02.000Z" }).price).toBe(1);
    expect(marketKey("sol", "AbC")).not.toBe(marketKey("sol", "abc"));
  });
  it("keeps SPYx token-level scale stable across partial pair refreshes", () => {
    const spy = { ...item, chain: "sol", address: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", tokenAddress: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", symbol: "SPYx", price: 767.5942, marketCap: 73_100_000, holders: 75_373 };
    const pair = { ...spy, tokenAddress: "wrongPairAddress", pairAddress: spy.tokenAddress, price: 0.2946, marketCap: 0, holders: null, receivedAt: "2026-09-19T00:00:02.000Z", fieldSources: { price: "dex" }, fieldUpdatedAt: { price: "2026-09-19T00:00:02.000Z" } };
    expect(mergeSnapshot(spy, pair)).toBe(spy);
  });
});
