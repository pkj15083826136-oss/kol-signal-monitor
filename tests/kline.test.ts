import { describe, expect, it } from "vitest";
import { KLINE_INTERVALS, KLINE_META, KlineCache, isKlineInterval, klinePollingDelay, mergeCandles } from "@/lib/kline";

describe("Kline intervals and request cache", () => {
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
    const result = { candles: [], source: "test", reason: "" };
    const cache = new KlineCache({ 15: result });
    expect(cache.has(5)).toBe(false);
    cache.set(5, result);
    expect(cache.has(5)).toBe(true);
    expect(cache.get(5)).toBe(result);
    cache.set(1, result);
    expect(cache.get(1)).toBe(result);
  });
  it("updates the current candle and appends a new period without clearing history", () => {
    const current = { candles: [{ time: 1, open: 1, high: 2, low: 1, close: 1.5, volume: 2 }], source: "Ave", reason: "" };
    const merged = mergeCandles(current, { candles: [{ time: 1, open: 1, high: 3, low: 1, close: 2, volume: 4 }, { time: 2, open: 2, high: 4, low: 2, close: 3, volume: 5 }], source: "Ave", reason: "" });
    expect(merged.candles).toHaveLength(2); expect(merged.candles[0].close).toBe(2); expect(merged.candles[1].time).toBe(2);
  });
  it("uses short foreground intervals and a 60 second hidden interval", () => {
    expect(klinePollingDelay(1, false)).toBe(7500); expect(klinePollingDelay(15, false)).toBe(12000); expect(klinePollingDelay(1440, false)).toBe(25000); expect(klinePollingDelay(1, true)).toBe(60000);
  });
});
