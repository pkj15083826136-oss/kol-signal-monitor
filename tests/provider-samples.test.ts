import { describe, expect, it } from "vitest";
import { PROVIDER_SAMPLE_UPSERT, recordKlineSample, recordMarketSamples } from "@/lib/provider-samples";

describe("provider telemetry", () => {
  it("aggregates repeated observations in the same bucket instead of dropping retries", async () => {
    expect(PROVIDER_SAMPLE_UPSERT).toContain("observation_count = provider_samples.observation_count + 1");
    expect(PROVIDER_SAMPLE_UPSERT).toContain("request_count = provider_samples.request_count + excluded.request_count");
    expect(PROVIDER_SAMPLE_UPSERT).toContain("rate_limited = provider_samples.rate_limited + excluded.rate_limited");
    let sql = ""; let bindings: unknown[] = [];
    const db = {
      prepare(statement: string) {
        sql = statement;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { run: async () => ({ success: true }) };
          },
        };
      },
    } as unknown as D1Database;
    await recordKlineSample(db, "sol", "ExactMint", 15, { candles: [], source: "", reason: "limited", providerMeta: { requestCount: 2, latencyMs: 80, cacheHit: false, rateLimited: true, status: "rate_limited" } }, new Date("2026-09-21T00:07:00.000Z"));
    expect(sql).toContain("ON CONFLICT(source, chain, token_address, data_kind, interval, bucket) DO UPDATE");
    expect(bindings).toContain("rate_limited");
    expect(bindings).toContain(2);
  });
  it("does not copy one upstream batch request onto every token", async () => {
    const statements: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...values: unknown[]) => { statements.push(values); return {}; } }), batch: async () => [] } as unknown as D1Database;
    const base = { chain: "base", address: "0xaaaaaaaaaa", tokenAddress: "0xaaaaaaaaaa", pairAddress: "", symbol: "A", decimals: null, price: 1, priceChange24h: null, marketCap: 1, liquidity: 1, holders: 1, volume24h: 1, updatedAt: "2026-09-23T00:00:00Z", sourceTimestamp: "2026-09-23T00:00:00Z", receivedAt: "2026-09-23T00:00:00Z", source: "OKX Onchain", identityVerified: true, fieldSources: {}, fieldUpdatedAt: {}, staleFields: [], conflictFields: [], providerMeta: { requestCount: 1, latencyMs: 1, cacheHit: false, rateLimited: false, status: "healthy" as const } };
    await recordMarketSamples(db, [base, { ...base, address: "0xbbbbbbbbbb", tokenAddress: "0xbbbbbbbbbb" }]);
    expect(statements.map((values) => values[4])).toEqual([1, 0]);
  });
});
