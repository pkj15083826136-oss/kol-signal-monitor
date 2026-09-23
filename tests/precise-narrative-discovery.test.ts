import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isSearchActionDescription, parseRadarAiReview, safeXPostUrl, sourceDescriptionFingerprint } from "@/lib/radar/ai";
import { narrativeTaskId } from "@/lib/radar/intake";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";
import { radarAiFallback } from "@/lib/radar/ai";
import type { RadarCandidate } from "@/lib/radar/types";

const cutoff = "2026-09-23T01:00:00.000Z";
function candidate(patch: Partial<RadarCandidate> = {}): RadarCandidate {
  return { source: "ave_smart_browser", sourceEventId: "evt-1", chain: "bsc", tokenAddress: "0x108876c3df3d893350e9b780563b3697aa3e7777", pairAddress: null, name: "CZBUILDER", symbol: "CZB", firstSeenAt: cutoff, poolCreatedAt: null, price: "0.001", marketCap: 100_000, liquidity: null, volume24h: 20_000, holders: 100, buyers: null, sellers: null, smartMoneyCount: 3, dataFetchedAt: cutoff, identityVerified: false, sellSimulationPassed: null, honeypot: null, mintable: null, freezable: null, blacklistable: null, taxModifiable: null, buyTaxBps: null, sellTaxBps: null, lpLocked: null, topHolderPct: null, developerRisk: "unknown", priceImpactBps: null, sourceConflict: false, sourceProjectDescription: "项目源于CZ社区建造者梗但官方故事未披露", sourceDescriptionRaw: "项目源于CZ社区建造者梗但官方故事未披露", sourceDescriptionAt: cutoff, sourceDescriptionSource: "ave_smart_browser", rawSnapshot: {}, ...patch };
}
function xaiResponse(text: string, id: string, details: Record<string, number> = {}) { return new Response(JSON.stringify({ id, output: [{ content: [{ text }] }], usage: { input_tokens: 10, output_tokens: 20, cost_in_usd_ticks: 500_000, server_side_tool_usage_details: details }, server_side_tool_usage: details.x_posts_fetched === undefined ? {} : { SERVER_SIDE_TOOL_X_SEARCH: 1 } }), { status: 200, headers: { "Content-Type": "application/json" } }); }

describe("precise narrative discovery", () => {
  it("uses one stable task for 71 repeated events whose timestamps change", () => {
    const base = candidate(); const review = { ...radarAiFallback(), claim_fingerprint: sourceDescriptionFingerprint(base.sourceProjectDescription) };
    const ids = Array.from({ length: 71 }, (_, index) => narrativeTaskId(309, { ...base, sourceEventId: `evt-${index}`, firstSeenAt: new Date(Date.parse(cutoff) + index * 60_000).toISOString() }, review));
    expect(new Set(ids).size).toBe(1);
  });
  it("keeps different candidates independent", () => {
    const review = radarAiFallback();
    expect(narrativeTaskId(1, candidate(), review)).not.toBe(narrativeTaskId(2, candidate({ tokenAddress: "0x14f6a94909c407854390aa2d2462a3095d317777" }), review));
  });
  it("plans without tools then performs exactly one bounded X Search", async () => {
    const plan = JSON.stringify({ narrative_hypothesis: "可能借用CZ与Builder文化，但未证明官方参与", core_entities: ["CZ", "Builder"], event_entities: [], cultural_reference: "Builder文化", token_identity_terms: ["CZBUILDER", "CZB"], primary_query: "CZBUILDER CZB 0x108876", fallback_topic_query: "CZ Builder community meme", expected_evidence_types: ["TOKEN_DIRECT", "THEME_CONTEXT"], ambiguity_warning: "不要把泛CZ帖子当直接证据" });
    const result = JSON.stringify({ status: "COMPLETED", decision: "HOLD", confidence: 0.42, narrative_score: 58, meme_potential_score: 72, catalyst_evidence_score: 18, risk_score: 45, freshness_score: 61, sentiment_score: 55, lead_score: 49, stage: "萌芽", summary: "未发现与该Token直接相关的可靠帖子。以下证据仅用于评价初始简介所描述主题的传播潜力。", positive_reasons: ["题材可传播"], negative_reasons: ["无直接证据"], invalidators: [], recommended_action: "HOLD", evidence: Array.from({ length: 7 }, (_, index) => ({ source_url: `https://x.com/user/status/${100 + index}`, x_post_id: String(100 + index), author_handle: "user", published_at: "2026-09-22T23:00:00.000Z", short_summary: `证据${index}`, evidence_relation: "THEME_CONTEXT", relevance_score: 80 - index, engagement_metrics: { likes: 10 } })) });
    const fetcher = vi.fn().mockResolvedValueOnce(xaiResponse(plan, "plan-1")).mockResolvedValueOnce(xaiResponse(result, "search-1", { x_posts_fetched: 25, x_users_fetched: 0 }));
    const review = await reviewRadarCandidate(candidate(), "test-key", fetcher, { timeoutMs: 100, claimFingerprint: "claim" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body)); const second = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(first.tools).toBeUndefined(); expect(first.input).toContain("不要联网"); expect(second.input).toContain("可能借用CZ与Builder文化");
    expect(second.tools).toHaveLength(1); expect(second.max_tool_calls).toBe(1); expect(second.tools[0].enable_image_understanding).toBe(false); expect(second.tools[0].enable_video_understanding).toBe(false);
    expect(review.evidence).toHaveLength(5); expect(review.fetch_status).toBe("EXCESSIVE_X_FETCH"); expect(review.x_posts_fetched).toBe(25);
  });
  it("distinguishes theme evidence, blocks fake links and ignores search action descriptions", () => {
    expect(safeXPostUrl("javascript:alert(1)")).toBeNull(); expect(safeXPostUrl("https://example.com/status/1")).toBeNull(); expect(safeXPostUrl("https://x.com/a/status/123")).toContain("x.com/a/status/123");
    expect(isSearchActionDescription("X semantic search results for CZ")).toBe(true);
    const parsed = parseRadarAiReview({ decision: "HOLD", confidence: 0.4, narrative_score: 50, meme_potential_score: 70, catalyst_evidence_score: 10, risk_score: 40, freshness_score: 50, sentiment_score: 50, lead_score: 50, stage: "萌芽", summary: "主题证据，不是Token直接证据", evidence: [{ source_url: "https://x.com/a/status/123", short_summary: "CZ Builder主题讨论", evidence_relation: "THEME_CONTEXT", relevance_score: 70 }, { source_url: null, short_summary: "X keyword search for CZ", evidence_relation: "TOKEN_DIRECT", relevance_score: 100 }] }, { inputCutoffAt: cutoff });
    expect(parsed.evidence).toHaveLength(1); expect(parsed.evidence[0].evidence_relation).toBe("THEME_CONTEXT"); expect(parsed.evidence[0].source_url).toContain("x.com");
  });
  it("adds additive telemetry and immutable source-description columns", () => {
    const migration = readFileSync("drizzle/0018_serious_archangel.sql", "utf8");
    for (const field of ["source_project_description", "source_description_fingerprint", "x_posts_fetched", "x_users_fetched", "cost_in_usd_ticks", "fetch_status"]) expect(migration).toContain(field);
    expect(migration).toContain("CREATE TABLE `xai_request_usage`"); expect(migration).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });
  it("repairs JSON without search tools and keeps outcome tracking AI-free", async () => {
    const plan = JSON.stringify({ narrative_hypothesis: "身份优先", core_entities: ["CZB"], event_entities: [], cultural_reference: null, token_identity_terms: ["CZB"], primary_query: "CZB contract", fallback_topic_query: "builder meme", expected_evidence_types: ["TOKEN_DIRECT"], ambiguity_warning: null });
    const repaired = JSON.stringify({ decision: "HOLD", confidence: 0.3, narrative_score: 45, meme_potential_score: 60, catalyst_evidence_score: 10, risk_score: 40, freshness_score: 50, sentiment_score: 50, lead_score: 40, stage: "萌芽", summary: "证据有限", positive_reasons: [], negative_reasons: ["证据有限"], invalidators: [], recommended_action: "HOLD", evidence: [] });
    const fetcher = vi.fn().mockResolvedValueOnce(xaiResponse(plan, "plan-2")).mockResolvedValueOnce(xaiResponse("{broken", "search-2", { x_posts_fetched: 2, x_users_fetched: 0 })).mockResolvedValueOnce(xaiResponse(repaired, "repair-2"));
    await reviewRadarCandidate(candidate(), "test-key", fetcher, { timeoutMs: 100 });
    expect(fetcher).toHaveBeenCalledTimes(3); expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body)).tools).toBeUndefined();
    expect(readFileSync("lib/radar/outcomes.ts", "utf8")).not.toMatch(/reviewRadarCandidate|api\.x\.ai|x_search/);
  });
  it("renders only validated evidence links and explicit missing-link text", () => {
    const ui = readFileSync("app/radar/radar-dashboard.tsx", "utf8");
    expect(ui).toContain("历史证据链接未保存"); expect(ui).toContain("来源链接未返回"); expect(ui).toContain("EXCESSIVE_X_FETCH");
  });
});
