import { describe, expect, it } from "vitest";
import { PROVIDER_SAMPLE_UPSERT, recordKlineSample } from "@/lib/provider-samples";

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
});
