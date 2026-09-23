import { describe, expect, it } from "vitest";
import { decideRadar, hardFilter, radarCandidateKey, sourceEventKey } from "@/lib/radar/policy";
import { parseRadarAiReview, radarAiFallback } from "@/lib/radar/ai";
import type { RadarAiReview, RadarCandidate } from "@/lib/radar/types";

const now = Date.parse("2026-09-21T10:00:00.000Z");
function safeCandidate(patch: Partial<RadarCandidate> = {}): RadarCandidate {
  return { source: "fixture", sourceEventId: "evt-1", chain: "bsc", tokenAddress: "0x1111111111111111111111111111111111111111", pairAddress: "0x2222222222222222222222222222222222222222", name: "Radar", symbol: "RDR", firstSeenAt: "2026-09-21T09:55:00.000Z", poolCreatedAt: "2026-09-21T09:00:00.000Z", price: "0.0021", marketCap: 1_000_000, liquidity: 100_000, volume24h: 500_000, holders: 450, buyers: 80, sellers: 30, smartMoneyCount: 12, dataFetchedAt: "2026-09-21T09:59:30.000Z", identityVerified: true, sellSimulationPassed: true, honeypot: false, mintable: false, freezable: false, blacklistable: false, taxModifiable: false, buyTaxBps: 100, sellTaxBps: 100, lpLocked: true, topHolderPct: 12, developerRisk: "clear", priceImpactBps: 250, sourceConflict: false, rawSnapshot: {}, ...patch };
}
const approve: RadarAiReview = {
  status: "COMPLETED", decision: "APPROVE", confidence: 0.95, narrative_score: 90, meme_potential_score: 90, catalyst_evidence_score: 85, risk_score: 10,
  stage: "early", summary: "verified", freshness_score: 90, sentiment_score: 80, lead_score: 75,
  positive_reasons: ["verified"], negative_reasons: [], invalidators: [], recommended_action: "paper",
  model_version: "test", evidence_refs: ["fixture"], evidence: [{ source_url: "https://x.com/test/status/1", x_post_id: "1", author_handle: "test", author_name: "Test", published_at: "2026-09-21T09:50:00.000Z", short_summary: "fixture", evidence_relation: "TOKEN_DIRECT", relevance_score: 90, engagement_metrics: {}, before_signal_cutoff: true }],
  prompt_version: "test", input_cutoff_at: "2026-09-21T09:55:00.000Z", analysis_at: "2026-09-21T10:00:00.000Z",
  attempt_count: 1, error_code: null, input_tokens: 1, output_tokens: 1, cost_microusd: 1, cost_in_usd_ticks: 10_000, discovery_plan: null, claim_fingerprint: "test", analysis_stage: "NARRATIVE_DISCOVERY", x_search_calls: 1, x_posts_fetched: 1, x_users_fetched: 0, fetch_status: "NORMAL", response_id: "response", usage_events: [],
};

describe("radar deterministic gate", () => {
  it("deduplicates token identity per chain while preserving source-event identity", () => {
    expect(radarCandidateKey("bsc", "0xABC")).toBe("bsc:0xabc");
    expect(radarCandidateKey("sol", "AbC")).toBe("sol:AbC");
    expect(sourceEventKey(safeCandidate())).toBe("fixture:evt-1");
  });
  it("rejects pair/token confusion, stale data and unknown safety fields", () => {
    expect(hardFilter(safeCandidate({ pairAddress: "0x1111111111111111111111111111111111111111" }), undefined, now).passed).toBe(false);
    expect(hardFilter(safeCandidate({ dataFetchedAt: "2026-09-21T09:00:00.000Z" }), undefined, now).reasons).toContain("行情数据已过期，等待刷新");
    expect(hardFilter(safeCandidate({ sellSimulationPassed: null }), undefined, now).passed).toBe(false);
  });
  it("never lets an AI approval bypass a failed hard filter", () => {
    const result = decideRadar(safeCandidate({ honeypot: true }), approve, undefined, now);
    expect(result.decision).toBe("REJECT");
    expect(result.hard.passed).toBe(false);
  });
  it("defaults malformed or unavailable AI output to HOLD", () => {
    expect(radarAiFallback().decision).toBe("HOLD");
    expect(parseRadarAiReview("not-json").decision).toBe("HOLD");
    expect(parseRadarAiReview({ ...approve, confidence: 2 }, { inputCutoffAt: approve.input_cutoff_at }).confidence).toBe(1);
    expect(decideRadar(safeCandidate(), radarAiFallback(), undefined, now).decision).toBe("HOLD");
  });
});
