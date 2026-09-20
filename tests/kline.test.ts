import { describe, expect, it } from "vitest";
import { KLINE_INTERVALS, KLINE_META, KlineCache, isKlineInterval, klineCacheKey, klinePollingDelay, klineUnavailableReason, mergeCandles, normalizeKlineLimit } from "@/lib/kline";

describe("Kline intervals and request cache", () => {
  it("distinguishes an unindexed BSC token from an unsupported chain", () => {
    expect(klineUnavailableReason("bsc", 15)).toContain("暂未收录");
    expect(klineUnavailableReason("bsc", 15)).not.toContain("该链暂不支持");
    expect(klineUnavailableReason("unknown", 15)).toContain("该链暂不支持");
  });
  it("maps all six supported periods to the requested windows", () => {
    expect(KLINE_INTERVALS).toEqual([1, 5, 15, 60, 240, 1440]);
    expect(KLINE_META[1]).toMatchObject({ label: "1分钟", limit: 480, geckoUnit: "minute", geckoAggregate: 1 });
    expect(KLINE_META[5]).toMatchObject({ label: "5分钟", limit: 120, geckoUnit: "minute", geckoAggregate: 5 });
    expect(KLINE_META[15]).toMatchObject({ label: "15分钟", limit: 120, geckoUnit: "minute", geckoAggregate: 15 });
    expect(KLINE_META[60]).toMatchObject({ label: "1小时", limit: 168, geckoUnit: "hour", geckoAggregate: 1 });
    expect(KLINE_META[240]).toMatchObject({ label: "4小时", limit: 180, geckoUnit: "hour", geckoAggregate: 4 });
    expect(KLINE_META[1440]).toMatchObject({ label: "1天", limit: 180, geckoUnit: "day", geckoAggregate: 1 });
    expect(isKlineInterval(30)).toBe(false);
  });
  it("reuses a result after the first request for a period", () => {
    const result = { candles: [{ time: 1, open: 1, high: 2, low: 1, close: 1.5, volume: 2 }], source: "test", reason: "" };
    const cache = new KlineCache();
    expect(cache.get("sol", "MintA", 5)).toBeUndefined();
    cache.setHistory("sol", "MintA", 5, result, "2026-09-20T00:00:00.000Z");
    expect(cache.get("sol", "MintA", 5)).toMatchObject({ isHistoryLoaded: true, historyBars: result.candles, liveTailBars: [] });
    expect(cache.get("sol", "minta", 5)).toBeUndefined();
    expect(cache.get("sol", "MintA", 15)).toBeUndefined();
    expect(cache.get("base", "MintA", 5)).toBeUndefined();
  });
  it("updates the current candle and appends a new period without clearing history", () => {
    const current = { candles: [{ time: 1, open: 1, high: 2, low: 1, close: 1.5, volume: 2 }], source: "Ave", reason: "" };
    const merged = mergeCandles(current, { candles: [{ time: 1, open: 1, high: 3, low: 1, close: 2, volume: 4 }, { time: 2, open: 2, high: 4, low: 2, close: 3, volume: 5 }], source: "Ave", reason: "" });
    expect(merged.candles).toHaveLength(2); expect(merged.candles[0].close).toBe(2); expect(merged.candles[1].time).toBe(2);
    const cache = new KlineCache();
    cache.setHistory("sol", "MintA", 1, current, "2026-09-20T00:00:00.000Z");
    const state = cache.mergeIncremental("sol", "MintA", 1, { candles: [{ time: 1, open: 1, high: 3, low: 1, close: 2, volume: 4 }, { time: 2, open: 2, high: 4, low: 2, close: 3, volume: 5 }], source: "Ave", reason: "" }, "2026-09-20T00:00:05.000Z");
    expect(state?.historyBars).toHaveLength(1);
    expect(state?.liveTailBars).toHaveLength(2);
    expect(state?.mergedBars).toHaveLength(2);
    expect(state?.lastFullFetchAt).toBe("2026-09-20T00:00:00.000Z");
    expect(state?.lastIncrementalFetchAt).toBe("2026-09-20T00:00:05.000Z");
  });
  it("does not turn a missing full-history limit into two bars", () => {
    expect(normalizeKlineLimit(null)).toBeUndefined();
    expect(normalizeKlineLimit("5")).toBe(5);
    expect(normalizeKlineLimit("1000")).toBe(500);
    expect(Number.isNaN(normalizeKlineLimit("bad"))).toBe(true);
    expect(klineCacheKey("sol", "MintCase", 15)).not.toBe(klineCacheKey("sol", "mintcase", 15));
    expect(klineCacheKey("base", "0xAbC", 15)).toBe(klineCacheKey("BASE", "0xabc", 15));
  });
  it("uses short foreground intervals and a 60 second hidden interval", () => {
    expect(klinePollingDelay(1, false)).toBe(7500); expect(klinePollingDelay(15, false)).toBe(12000); expect(klinePollingDelay(1440, false)).toBe(25000); expect(klinePollingDelay(1, true)).toBe(60000);
  });
});
