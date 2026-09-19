import { describe, expect, it } from "vitest";
import { KLINE_INTERVALS, KLINE_META, KlineCache, isKlineInterval } from "@/lib/kline";

describe("Kline intervals and request cache", () => {
  it("maps all five supported periods to the requested windows", () => {
    expect(KLINE_INTERVALS).toEqual([5, 15, 60, 240, 1440]);
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
  });
});
