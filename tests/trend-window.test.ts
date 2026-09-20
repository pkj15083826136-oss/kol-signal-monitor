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
    expect(result.series.holders.some((point) => point.value === null)).toBe(true);
  });
  it("does not fabricate a 24 hour series when fewer than two valid samples exist", () => {
    const result = buildTrendWindow([{ capturedAt: "2026-09-20T11:00:00.000Z", holders: 3, amount: 15, value: 30 }], now);
    expect(result.points).toHaveLength(1);
    expect(result.ready).toBe(false);
    expect(result.coverageLabel).toBe("0小时0分钟");
  });

  it("normalizes seconds and milliseconds, sorts and deduplicates observations", () => {
    const result = buildTrendWindow([
      { capturedAt: "1789902000", holders: 2, amount: 20, value: 200 },
      { capturedAt: "2026-09-20T11:00:00.000Z", holders: 3, amount: 30, value: 300 },
      { capturedAt: "2026-09-20T11:00:00.000Z", holders: 4, amount: 40, value: 400 },
    ], now);
    expect(result.points.map((point) => point.time)).toEqual([...new Set(result.points.map((point) => point.time))].sort((a, b) => a - b));
    expect(result.points.at(-1)?.holders).toBe(4);
  });

  it("keeps each metric on its own real observation timestamps", () => {
    const result = buildTrendWindow([
      { capturedAt: "2026-09-20T10:00:00.000Z", holders: 2, amount: Number.NaN, value: Number.NaN },
      { capturedAt: "2026-09-20T10:03:00.000Z", holders: Number.NaN, amount: 30, value: Number.NaN },
      { capturedAt: "2026-09-20T10:06:00.000Z", holders: Number.NaN, amount: Number.NaN, value: 400 },
      { capturedAt: "2026-09-20T10:09:00.000Z", holders: 3, amount: 35, value: 420 },
    ], now);
    expect(result.series.holders.filter((point) => point.value !== null).map((point) => point.time)).toEqual([Date.parse("2026-09-20T10:00:00.000Z"), Date.parse("2026-09-20T10:09:00.000Z")]);
    expect(result.series.amount.filter((point) => point.value !== null).map((point) => point.time)).toEqual([Date.parse("2026-09-20T10:03:00.000Z"), Date.parse("2026-09-20T10:09:00.000Z")]);
    expect(result.series.value.filter((point) => point.value !== null).map((point) => point.time)).toEqual([Date.parse("2026-09-20T10:06:00.000Z"), Date.parse("2026-09-20T10:09:00.000Z")]);
  });

  it("reports source coverage and real missing reasons without inventing points", () => {
    const result = buildTrendWindow([
      { capturedAt: "2026-09-20T10:00:00.000Z", holders: 2, amount: 20, value: 200, coverage: 1 },
      { capturedAt: "2026-09-20T10:03:00.000Z", holders: 2, amount: 20, value: 210, coverage: 0.5, missingReason: "smartmoney source unavailable" },
    ], now);
    expect(result.sampleCoverage).toBe(0.75);
    expect(result.missingReasons).toEqual(["smartmoney source unavailable"]);
    expect(result.points).toHaveLength(2);
  });
});
