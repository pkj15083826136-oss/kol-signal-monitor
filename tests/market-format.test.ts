import { describe, expect, it } from "vitest";
import { formatShanghaiDateTime, formatSignalAge, formatTokenPrice, formatUsdCompact } from "@/lib/market-format";

describe("market and signal formatting", () => {
  const now = Date.parse("2026-09-20T04:00:00.000Z");
  it("formats each signal from its own created_at", () => {
    expect(formatSignalAge("2026-09-20T03:59:40.000Z", now)).toBe("刚刚");
    expect(formatSignalAge("2026-09-20T03:18:00.000Z", now)).toBe("42分钟前");
    expect(formatSignalAge("2026-09-19T22:00:00.000Z", now)).toBe("6小时前");
    expect(formatSignalAge("2026-09-17T04:00:00.000Z", now)).toBe("3天前");
  });
  it("uses UTC+8 for absolute signal timestamps", () => {
    expect(formatSignalAge("2026-09-01T16:21:00.000Z", now)).toBe("2026-09-02 00:21");
    expect(formatShanghaiDateTime("2026-09-01T16:21:00.000Z")).toBe("2026-09-02 00:21");
  });
  it("market refresh timestamps cannot change signal age", () => {
    const createdAt = "2026-09-20T03:18:00.000Z";
    expect(formatSignalAge(createdAt, now)).toBe(formatSignalAge(createdAt, now));
  });
  it("formats small prices and compact market metrics without fake zeroes", () => {
    expect(formatTokenPrice(0.00002246)).toBe("$0.00002246");
    expect(formatUsdCompact(21_920)).toBe("$21.92K");
    expect(formatUsdCompact(1_230_000)).toBe("$1.23M");
    expect(formatUsdCompact(0)).toBe("--");
  });
});
