import { describe, expect, it } from "vitest";
import { FIRST_SIGNAL_MAX_AGE_MS, FIRST_SIGNAL_MAX_MARKET_CAP, assessFirstSignal, isMatureBaseAsset, rejectFirstSignal } from "@/lib/signal-policy";

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
  it("sends unknown critical data to review instead of treating it as an early signal", () => {
    expect(assessFirstSignal({ symbol: "NEW", marketCap: null, createdAt: now, identityVerified: true })).toMatchObject({ status: "data_review" });
    expect(assessFirstSignal({ symbol: "NEW", marketCap: 1_000_000, createdAt: null, identityVerified: true })).toMatchObject({ status: "data_review" });
  });
  it("suppresses old high-cap assets and the confirmed HYPE contract", () => {
    expect(assessFirstSignal({ symbol: "NEW", marketCap: 20_000_001, createdAt: now - FIRST_SIGNAL_MAX_AGE_MS - 1, identityVerified: true, now })).toMatchObject({ status: "suppressed" });
    expect(assessFirstSignal({ symbol: "HYPE", chain: "sol", address: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g", marketCap: 1, createdAt: now, identityVerified: true, now })).toMatchObject({ status: "suppressed" });
    expect(assessFirstSignal({ symbol: "HYPE", chain: "sol", address: "98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g", marketCap: 1, createdAt: now, identityVerified: true, now })).toMatchObject({ status: "allow" });
  });
});
