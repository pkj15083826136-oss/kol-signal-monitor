import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_BUDGETS, tokenCacheKey } from "@/lib/external-api-control";

describe("external API usage guardrails", () => {
  it("deduplicates token cache keys by chain and normalized EVM address", () => {
    expect(tokenCacheKey("gmgn", "/v1/token/info", "base", "0xABCDEF0000")).toBe(tokenCacheKey("gmgn", "/v1/token/info", "base", "0xabcdef0000"));
    expect(tokenCacheKey("gmgn", "/v1/token/info", "sol", "AbCdEf1234")).not.toBe(tokenCacheKey("gmgn", "/v1/token/info", "sol", "abcdef1234"));
  });

  it("keeps Premium below 100 calls per day and defines daily plus monthly breakers", () => {
    expect(API_BUDGETS["okx:premium"]).toEqual({ daily: 90, monthly: 2_500 });
    expect(API_BUDGETS["okx:basic"].monthly).toBeGreaterThan(API_BUDGETS["okx:basic"].daily);
    expect(API_BUDGETS["gmgn:basic"].monthly).toBeGreaterThan(API_BUDGETS["gmgn:basic"].daily);
  });

  it("serves page polling and signal listing from D1 without provider calls", () => {
    const batchRoute = readFileSync("app/api/market/batch/route.ts", "utf8");
    const signalsRoute = readFileSync("app/api/signals/route.ts", "utf8");
    expect(batchRoute).not.toContain("getBatchMarketData(");
    expect(batchRoute).not.toContain("getMarketData(");
    expect(batchRoute).not.toContain("priceInfo(");
    expect(signalsRoute).not.toContain("getMarketData(");
    expect(batchRoute).toContain("cacheOnly: true");
  });

  it("records one usage row per outbound HTTP rather than one row per token", () => {
    const provider = readFileSync("lib/providers/okx.ts", "utf8");
    expect(provider).toContain("tokenCount: context.tokenCount");
    expect(provider).not.toContain("items.map((item) => recordExternalHttp");
  });
});
