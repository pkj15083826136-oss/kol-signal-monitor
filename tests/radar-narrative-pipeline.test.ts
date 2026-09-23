import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseRadarAiReview } from "@/lib/radar/ai";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";
import { hardFilter } from "@/lib/radar/policy";
import type { RadarCandidate } from "@/lib/radar/types";

const cutoff = "2026-09-22T09:46:50.000Z";
function candidate(patch: Partial<RadarCandidate> = {}): RadarCandidate {
  return { source: "ave_smart_browser", sourceEventId: "evt-1", chain: "bsc", tokenAddress: "0x542bc840e65b199428c36042d27a0f3c69127777", pairAddress: null, dexId: "cakev2", name: "Harvest farm narrative", symbol: "HARVEST", firstSeenAt: cutoff, poolCreatedAt: null, price: "0.0002", marketCap: 200_000, liquidity: null, volume24h: 100_000, holders: 500, buyers: null, sellers: null, smartMoneyCount: 3, dataFetchedAt: cutoff, identityVerified: false, sellSimulationPassed: null, honeypot: null, mintable: null, freezable: null, blacklistable: null, taxModifiable: null, buyTaxBps: null, sellTaxBps: null, lpLocked: null, topHolderPct: null, developerRisk: "unknown", priceImpactBps: null, sourceConflict: false, rawSnapshot: {}, ...patch };
}
function grokJson(patch: Record<string, unknown> = {}) {
  return JSON.stringify({ status: "COMPLETED", decision: "HOLD", confidence: 0.72, narrative_score: 61, meme_potential_score: 68, catalyst_evidence_score: 35, risk_score: 39, freshness_score: 58, sentiment_score: 64, lead_score: 44, stage: "扩散", summary: "Harvest农场题材正在小范围扩散，存在社区传播但缺少强新闻催化。", positive_reasons: ["社区传播"], negative_reasons: ["催化有限"], invalidators: [], recommended_action: "HOLD", evidence: [{ source_url: "https://x.com/harvest/status/123", short_summary: "signal-time post", published_at: "2026-09-22T09:40:00.000Z", evidence_relation: "TOKEN_DIRECT", relevance_score: 90 }], ...patch });
}
function response(text: string, status = 200) { return new Response(status === 200 ? JSON.stringify({ output: [{ content: [{ text }] }], usage: { input_tokens: 10, output_tokens: 20 } }) : "{}", { status, headers: { "Content-Type": "application/json" } }); }

describe("radar narrative pipeline", () => {
  it("parses a completed Grok result without coupling it to trade eligibility", () => {
    const review = parseRadarAiReview(grokJson(), { inputCutoffAt: cutoff, analysisAt: "2026-09-22T10:00:00.000Z" });
    expect(review.status).toBe("COMPLETED"); expect(review.narrative_score).toBe(61); expect(review.evidence).toHaveLength(1);
  });
  it("marks post-signal evidence without pretending it existed at the cutoff", () => {
    const review = parseRadarAiReview(grokJson({ evidence: [{ source_url: "https://x.com/harvest/status/124", short_summary: "future", published_at: "2026-09-22T09:50:00.000Z", evidence_relation: "COMMUNITY_PROPAGATION", relevance_score: 70 }] }), { inputCutoffAt: cutoff });
    expect(review.status).toBe("COMPLETED"); expect(review.evidence[0].before_signal_cutoff).toBe(false);
  });
  it("reports invalid JSON as FAILED rather than zero", () => {
    const review = parseRadarAiReview("not-json", { inputCutoffAt: cutoff });
    expect(review.status).toBe("FAILED"); expect(review.error_code).toBe("JSON_INVALID"); expect(review.narrative_score).toBeNull();
  });
  it("recognizes rate limits and retries once before success", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response("", 429)).mockResolvedValueOnce(response(grokJson()));
    const review = await reviewRadarCandidate(candidate(), "test-key", fetcher, { maxAttempts: 2, timeoutMs: 100 });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(review.status).toBe("COMPLETED"); expect(review.attempt_count).toBe(1);
  });
  it("reports a timeout without inventing a narrative", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const review = await reviewRadarCandidate(candidate(), "test-key", fetcher, { maxAttempts: 1, timeoutMs: 10 });
    expect(review.status).toBe("FAILED"); expect(review.error_code).toBe("TIMEOUT"); expect(review.narrative_score).toBeNull();
  });
  it("marks trusted launchpad-only checks NOT_APPLICABLE", () => {
    const result = hardFilter(candidate({ chain: "sol", tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", launchpadId: "pump_fun", launchpadProgram: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" }));
    expect(result.checks.filter((item) => ["tax", "lp_lock", "owner_permissions"].includes(item.key)).every((item) => item.state === "NOT_APPLICABLE")).toBe(true);
  });
  it("deduplicates actual trade reasons", () => {
    const result = hardFilter(candidate({ tokenAddress: "bad", pairAddress: "bad" }));
    expect(result.reasons).toEqual([...new Set(result.reasons)]);
  });
  it("uses an idempotent recent-50 backfill query and preserves discovery time", () => {
    const source = readFileSync(new URL("../lib/radar/backfill.ts", import.meta.url), "utf8");
    expect(source).toContain("NOT EXISTS"); expect(source).toContain("n.status IN ('COMPLETED','INSUFFICIENT_EVIDENCE','FAILED')"); expect(source).toContain("Math.min(50");
    expect(source).not.toContain("DELETE FROM radar_signals");
  });
  it("keeps narrative and trade results in separate persistence tables", () => {
    const source = readFileSync(new URL("../lib/radar/intake.ts", import.meta.url), "utf8");
    expect(source).toContain("radar_narrative_analysis"); expect(source).toContain("radar_trade_eligibility");
    expect(source).toContain("n.status IN ('COMPLETED','INSUFFICIENT_EVIDENCE','FAILED')");
  });
});
