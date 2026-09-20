import { describe, expect, it } from "vitest";
import { buildTrendWindow } from "@/lib/trend-window";

describe("24 hour KOL trend window", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  it("keeps only real samples from the rolling 24 hour window and reports actual coverage", () => {
    const result = buildTrendWindow([
      { capturedAt: "2026-09-19T10:00:00.000Z", holders: 1, amount: 10, value: 20 },
      { capturedAt: "2026-09-20T09:30:00.000Z", holders: 2, amount: 12, value: 24 },
      { capturedAt: "2026-09-20T11:00:00.000Z", holders: 3, amount: 15, value: 30 },
    ], now);
    expect(result.points).toHaveLength(2);
    expect(result.coverageLabel).toBe("1小时30分钟");
    expect(result.domain).toEqual([Date.parse("2026-09-20T09:30:00.000Z"), Date.parse("2026-09-20T11:00:00.000Z")]);
    expect(result.chartPoints.some((point) => point.holders === null)).toBe(true);
  });
  it("does not fabricate a 24 hour series when fewer than two valid samples exist", () => {
    const result = buildTrendWindow([{ capturedAt: "2026-09-20T11:00:00.000Z", holders: 3, amount: 15, value: 30 }], now);
    expect(result.points).toHaveLength(1);
    expect(result.ready).toBe(false);
    expect(result.coverageLabel).toBe("0小时0分钟");
  });
});
