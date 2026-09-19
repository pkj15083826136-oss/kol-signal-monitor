import { describe, expect, it } from "vitest";
import { FIRST_SIGNAL_MAX_AGE_MS, FIRST_SIGNAL_MAX_MARKET_CAP, isMatureBaseAsset, rejectFirstSignal } from "@/lib/signal-policy";

describe("first signal policy", () => {
  const now = Date.UTC(2026, 8, 19);
  it("preserves the market-cap and age boundaries", () => {
    expect(rejectFirstSignal({ symbol: "NEW", marketCap: FIRST_SIGNAL_MAX_MARKET_CAP, createdAt: now - FIRST_SIGNAL_MAX_AGE_MS - 1, now })).toBe(false);
    expect(rejectFirstSignal({ symbol: "NEW", marketCap: FIRST_SIGNAL_MAX_MARKET_CAP + 1, createdAt: now - FIRST_SIGNAL_MAX_AGE_MS, now })).toBe(false);
    expect(rejectFirstSignal({ symbol: "NEW", marketCap: FIRST_SIGNAL_MAX_MARKET_CAP + 1, createdAt: now - FIRST_SIGNAL_MAX_AGE_MS - 1, now })).toBe(true);
    expect(rejectFirstSignal({ symbol: "NEW", marketCap: FIRST_SIGNAL_MAX_MARKET_CAP + 1, createdAt: 0, now })).toBe(true);
  });
  it("filters mature base assets regardless of case", () => {
    expect(isMatureBaseAsset(" weth ")).toBe(true);
    expect(rejectFirstSignal({ symbol: "WETH", marketCap: 1, createdAt: now, now })).toBe(true);
  });
});
