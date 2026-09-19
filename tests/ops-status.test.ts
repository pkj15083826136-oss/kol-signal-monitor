import { describe, expect, it } from "vitest";
import { buildAlertSummary, buildChainHealth, buildSourceHealth } from "@/lib/ops-status";

describe("sanitized operational status", () => {
  const now = Date.parse("2026-09-19T07:00:00.000Z");
  it("reports all four chains and detects failures/staleness", () => {
    const rows = [
      { chain: "sol", status: "success", finished_at: "2026-09-19T06:59:00.000Z" },
      { chain: "bsc", status: "failed", finished_at: "2026-09-19T06:59:00.000Z", error: "secret internal error" },
      { chain: "base", status: "success", finished_at: "2026-09-19T06:40:00.000Z" },
    ];
    const result = buildChainHealth(rows, now);
    expect(result.map((row) => row.state)).toEqual(["healthy", "degraded", "stale", "unknown"]);
    expect(JSON.stringify(result)).not.toContain("secret internal error");
  });
  it("sanitizes source health and aggregates alert states", () => {
    expect(buildSourceHealth([{ source: "gmgn_kol", chain: "sol", status: "healthy", last_attempt_at: "2026-09-19T06:59:00.000Z", last_latency_ms: 25, last_error: "hidden" }], now)[0]).not.toHaveProperty("lastError");
    expect(buildAlertSummary([{ alert_status: "pending", count: 2 }, { alert_status: "manual_review", count: 1 }])).toEqual({ pending: 2, retry: 0, manualReview: 1 });
  });
});
