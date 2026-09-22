import { describe, expect, it } from "vitest";
import { parseMarketCapLimit, shouldSuppressByMarketCap, trustedMarketCap } from "@/lib/market-cap-policy";
import { decodeSignalCursor, encodeSignalCursor, signalPageLimit } from "@/lib/signal-pagination";
import { GmgnTianyanAdapter, isTianyanSource } from "@/lib/radar/adapters/gmgn-tianyan";
import { classifyOutcome, evidenceAvailableAtSignal, frozenNarrativeInput, transitionPromptVersion } from "@/lib/radar/learning";
import { AveSmartEventBuffer } from "@/lib/radar/adapters/ave-smart-browser";
import { evaluateLaunchpadSafety, trustedLaunchpadProfile } from "@/lib/radar/launchpad";
import { dueOutcomeHorizons } from "@/lib/radar/outcomes";
import { buildSourceHealth, sourceRegistryHealth } from "@/lib/ops-status";
import { normalizeRadarCandidate } from "@/lib/radar/intake";
import { hardFilter } from "@/lib/radar/policy";
import { readFileSync } from "node:fs";

describe("phase 1.1 production contracts", () => {
  it.each([["20M", 20_000_000], ["1000M", 1_000_000_000], ["1B", 1_000_000_000], ["20000000", 20_000_000]])("parses %s", (input, expected) => expect(parseMarketCapLimit(input)).toBe(expected));
  it("fails closed for missing caps and suppresses the inclusive limit", () => {
    expect(shouldSuppressByMarketCap(null, 20_000_000)).toEqual({ suppress: false, review: true });
    expect(shouldSuppressByMarketCap(20_000_000, 20_000_000)).toEqual({ suppress: true, review: false });
  });
  it("uses opaque cursor pagination with a strict page cap", () => {
    const encoded = encodeSignalCursor({ alertedAt: "2026-09-22T00:00:00.000Z", id: 42 });
    expect(decodeSignalCursor(encoded)).toEqual({ alertedAt: "2026-09-22T00:00:00.000Z", id: 42 });
    expect(signalPageLimit(999)).toBe(20);
  });
  it("never labels KOL aggregation as Tianyan", async () => {
    expect(isTianyanSource("gmgn_kol_aggregation")).toBe(false);
    const result = await new GmgnTianyanAdapter().discover({ chains: ["sol"] });
    expect(result.status).toBe("GMGN_TIAN_YAN_BLOCKED");
    expect(result.candidates).toEqual([]);
  });
  it("keeps narrative evidence inside the frozen signal boundary", () => {
    expect(evidenceAvailableAtSignal("2026-09-22T00:00:00Z", "2026-09-21T23:59:59Z")).toBe(true);
    expect(evidenceAvailableAtSignal("2026-09-22T00:00:00Z", "2026-09-22T00:00:01Z")).toBe(false);
    expect(classifyOutcome(5)).toBe("A"); expect(classifyOutcome(2)).toBe("B"); expect(classifyOutcome(1)).toBe("C"); expect(classifyOutcome(0.9)).toBe("D"); expect(classifyOutcome(null)).toBe("UNKNOWN");
    expect(transitionPromptVersion("shadow", "publish")).toBe("published");
    expect(transitionPromptVersion("published", "rollback")).toBe("rolled_back");
  });
  it("applies only applicable launchpad hard gates", () => {
    const profile = trustedLaunchpadProfile("sol", "pump_fun", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
    expect(profile?.traditionalTaxApplicable).toBe(false);
    const result = evaluateLaunchpadSafety({ profile, identityVerified: true, factoryVerified: true, pairVerified: true, hasLiquidity: true, buyPath: true, sellPath: true, priceImpactBps: 500, fresh: true, maliciousEvidence: [] });
    expect(result.hardFailures).toEqual([]); expect(result.notApplicable).toContain("传统买卖税");
  });
  it("uses the trusted launchpad gate in the actual radar policy", () => {
    const candidate = normalizeRadarCandidate({
      source: "ave_smart_browser", sourceEventId: "pump-1", chain: "sol", tokenAddress: "Token111", pairAddress: "Pair111", name: "Pump token", symbol: "PUMP",
      firstSeenAt: "2026-09-22T00:00:00Z", poolCreatedAt: "2026-09-21T23:00:00Z", price: "0.001", marketCap: 100_000, liquidity: 50_000, volume24h: 80_000,
      holders: 100, buyers: 30, sellers: 10, smartMoneyCount: 2, dataFetchedAt: "2026-09-22T00:00:00Z", identityVerified: true, sellSimulationPassed: true,
      honeypot: false, mintable: null, freezable: null, blacklistable: null, taxModifiable: null, buyTaxBps: null, sellTaxBps: null, lpLocked: null, topHolderPct: null,
      developerRisk: "unknown", priceImpactBps: 500, sourceConflict: false, launchpadId: "pump_fun", launchpadProgram: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      launchpadFactoryVerified: true, launchpadPairVerified: true, launchpadBuyPath: true, launchpadSellPath: true,
    });
    expect(candidate).not.toBeNull();
    const result = hardFilter(candidate!, undefined, Date.parse("2026-09-22T00:01:00Z"));
    expect(result.passed).toBe(true);
    expect(result.reasons).not.toContain("买卖税异常或未知");
    expect(result.reasons).not.toContain("流动性锁定状态未确认");
  });
  it("schedules every outcome horizon idempotently", () => expect(dueOutcomeHorizons("2026-09-21T00:00:00Z", "2026-09-29T00:00:00Z", ["5m", "1h"])).toEqual(["30m", "4h", "24h", "7d"]));
  it("counts only enabled sources", () => {
    const health = sourceRegistryHealth([{ source: "okx", enabled: true, state: "healthy" }, { source: "reown", enabled: false, state: "off" }]);
    expect(health).toEqual({ healthy: 1, enabled: 1 });
  });
  it("preserves explicit blocked/off source states and only stales active sources", () => {
    const rows = buildSourceHealth([
      { source: "ave", chain: "all", status: "blocked", last_attempt_at: "2026-09-01T00:00:00Z" },
      { source: "wallet", chain: "all", status: "off", last_attempt_at: null },
      { source: "gmgn", chain: "sol", status: "healthy", last_attempt_at: "2026-09-01T00:00:00Z" },
    ], Date.parse("2026-09-22T00:00:00Z"));
    expect(rows.map((row) => row.state)).toEqual(["blocked", "off", "stale"]);
  });
  it("keeps wallet initialization code unloaded when the flag is off", () => {
    const root = readFileSync(new URL("../components/wallet/wallet-root.tsx", import.meta.url), "utf8");
    const button = readFileSync(new URL("../components/wallet/wallet-button.tsx", import.meta.url), "utf8");
    expect(root).toContain("disabledWallet");
    expect(button).toContain("钱包未启用");
  });
  it("removes the radar KOL fallback and preserves threshold zero outside notifications", () => {
    const view = readFileSync(new URL("../lib/radar/view.ts", import.meta.url), "utf8");
    const intake = readFileSync(new URL("../lib/radar/intake.ts", import.meta.url), "utf8");
    expect(view).not.toContain("GMGN KOL聚集（备用发现）");
    expect(intake).toContain("'radar_visible'");
  });
  it("rejects invalid cursor data", () => expect(decodeSignalCursor("broken")).toBeNull());
  it("retains last-known-good on implausible market-cap jumps", () => { expect(trustedMarketCap(150_000, 100_000)).toBe(150_000); expect(trustedMarketCap(9_000_000, 100_000)).toBe(100_000); expect(trustedMarketCap(null, 100_000)).toBe(100_000); });
  it("freezes narrative events without future leakage", () => expect(frozenNarrativeInput("2026-09-22T00:00:00Z", [{ capturedAt: "2026-09-21T23:00:00Z", id: 1 }, { capturedAt: "2026-09-22T01:00:00Z", id: 2 }]).map((row) => row.id)).toEqual([1]));
  it("rejects invalid prompt transitions", () => expect(() => transitionPromptVersion("draft", "publish")).toThrow("INVALID_PROMPT_VERSION_TRANSITION"));
  it("requires a launchpad sell path", () => { const profile = trustedLaunchpadProfile("sol", "pump_fun", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"); expect(evaluateLaunchpadSafety({ profile, identityVerified: true, factoryVerified: true, pairVerified: true, hasLiquidity: true, buyPath: true, sellPath: false, priceImpactBps: 100, fresh: true, maliciousEvidence: [] }).hardFailures).toContain("卖出路径不可执行"); });
  it("rejects an untrusted launchpad factory", () => expect(trustedLaunchpadProfile("sol", "pump_fun", "fake")).toBeNull());
  it("preserves deterministic malicious launchpad evidence", () => { const profile = trustedLaunchpadProfile("sol", "pump_fun", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"); expect(evaluateLaunchpadSafety({ profile, identityVerified: true, factoryVerified: true, pairVerified: true, hasLiquidity: true, buyPath: true, sellPath: true, priceImpactBps: 100, fresh: true, maliciousEvidence: ["已确认开发者撤池"] }).hardFailures).toContain("已确认开发者撤池"); });
  it("does not schedule future result horizons", () => expect(dueOutcomeHorizons("2026-09-22T00:00:00Z", "2026-09-22T00:10:00Z", [])).toEqual(["5m"]));
  it("parses Ave browser fields without claiming identity verification", () => { const buffer = new AveSmartEventBuffer(); const [candidate] = buffer.ingest([{ id: "a", token: "So11111111111111111111111111111111111111112", chain: "solana", symbol: "T", current_price_usd: "0.2", mc_cur: "200000", holders_cur: "42" }]); expect(candidate).toMatchObject({ source: "ave_smart_browser", marketCap: 200000, holders: 42, identityVerified: false }); });
  it("does not persist collector secrets in source", () => { const collector = readFileSync(new URL("../scripts/ave-smart-collector.mjs", import.meta.url), "utf8"); expect(collector).not.toMatch(/(?:api[_-]?key|secret)\s*=\s*["'][A-Za-z0-9_-]{16,}["']/i); expect(collector).toContain("process.env.MONITOR_SECRET"); });
  it("uses cursor SQL rather than loading all rows", () => { const route = readFileSync(new URL("../app/api/signals/route.ts", import.meta.url), "utf8"); expect(route).toContain("LIMIT ?"); expect(route).toContain("alerted_at < ?"); expect(route).not.toContain("LIMIT 80"); });
  it("filters the normal feed with the verified market review instead of a stale signal snapshot", () => {
    const route = readFileSync(new URL("../app/api/signals/route.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    expect(route).toContain("FROM market_reviews mr");
    expect(route).toContain("mr.market_cap >= ?");
    expect(page).toContain("FROM market_reviews mr");
  });
  it("refreshes only the client-visible token set", () => { const dashboard = readFileSync(new URL("../app/dashboard.tsx", import.meta.url), "utf8"); expect(dashboard).toContain("visibleIds.has"); expect(dashboard).toContain("IntersectionObserver"); });
  it("keeps the phase 1.1 migration additive", () => { const sql = readFileSync(new URL("../drizzle/0013_conscious_kat_farrell.sql", import.meta.url), "utf8"); expect(sql).toContain("CREATE TABLE `system_settings`"); expect(sql).toContain("CREATE TABLE `narrative_samples`"); expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE.*DROP/i); });
});
