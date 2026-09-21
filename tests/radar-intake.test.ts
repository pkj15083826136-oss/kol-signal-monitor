import { describe, expect, it } from "vitest";
import { normalizeRadarCandidate, normalizedRadarAddress, sanitizeRadarSnapshot } from "@/lib/radar/intake";
import { readFileSync } from "node:fs";

describe("radar ingestion boundary", () => {
  it("normalizes EVM addresses without changing Solana case", () => {
    expect(normalizedRadarAddress("bsc", " 0xAbC ")).toBe("0xabc");
    expect(normalizedRadarAddress("sol", " AbC ")).toBe("AbC");
  });
  it("removes secrets and signing material before raw snapshot persistence", () => {
    const clean = sanitizeRadarSnapshot({ token: "public-token-address", apiKey: "secret", headers: { Authorization: "Bearer secret" }, nested: { signature: "sig", value: 7 } });
    expect(clean).toEqual({ token: "public-token-address", headers: {}, nested: { value: 7 } });
  });
  it("retains last-known-good fields on null snapshots", () => {
    const source = readFileSync(new URL("../lib/radar/intake.ts", import.meta.url), "utf8");
    for (const field of ["market_cap", "liquidity", "volume_24h", "holders", "buyers", "sellers"]) expect(source).toContain(`${field}=COALESCE(excluded.${field}`);
    expect(source).toContain("CASE WHEN CAST(excluded.price AS REAL)>0");
  });
  it("normalizes undefined and non-finite values before the D1 boundary", () => {
    const candidate = normalizeRadarCandidate({ source: "test", sourceEventId: "1", chain: "base", tokenAddress: "0xAbC", marketCap: Number.NaN, holders: "12", rawSnapshot: {} });
    expect(candidate).not.toBeNull();
    expect(candidate?.marketCap).toBeNull();
    expect(candidate?.holders).toBe(12);
    expect(candidate?.pairAddress).toBeNull();
    expect(candidate?.sellSimulationPassed).toBeNull();
  });
});
