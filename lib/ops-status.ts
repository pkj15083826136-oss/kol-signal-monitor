export const MONITORED_CHAINS = ["sol", "bsc", "base", "robinhood"] as const;
export type HealthState = "healthy" | "rate_limited" | "degraded" | "unavailable" | "stale" | "unknown";
export type ChainHealth = { chain: string; state: HealthState; lastRunAt: string | null };
export type SourceHealth = { source: string; chain: string; state: HealthState; lastAttemptAt: string | null; lastSuccessAt: string | null; consecutiveFailures: number; nextRetryAt: string | null; impact: string; latencyMs: number };
export type AlertSummary = { pending: number; retry: number; manualReview: number };

const STALE_AFTER_MS = 10 * 60_000;

export function buildChainHealth(rows: Array<Record<string, unknown>>, now = Date.now()): ChainHealth[] {
  const latest = new Map(rows.map((row) => [String(row.chain), row]));
  return MONITORED_CHAINS.map((chain) => {
    const row = latest.get(chain);
    const lastRunAt = row?.finished_at ? String(row.finished_at) : null;
    if (!row || !lastRunAt) return { chain, state: "unknown", lastRunAt };
    if (String(row.status) !== "success") return { chain, state: "degraded", lastRunAt };
    return { chain, state: now - Date.parse(lastRunAt) > STALE_AFTER_MS ? "stale" : "healthy", lastRunAt };
  });
}

export function buildSourceHealth(rows: Array<Record<string, unknown>>, now = Date.now()): SourceHealth[] {
  return rows.map((row) => {
    const lastAttemptAt = row.last_attempt_at ? String(row.last_attempt_at) : null;
    const raw = String(row.status);
    let state: HealthState = (["healthy", "rate_limited", "degraded", "unavailable"] as string[]).includes(raw) ? raw as HealthState : "degraded";
    if (!lastAttemptAt) state = "unknown";
    else if (now - Date.parse(lastAttemptAt) > STALE_AFTER_MS) state = "stale";
    return { source: String(row.source), chain: String(row.chain), state, lastAttemptAt, lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null, consecutiveFailures: Number(row.consecutive_failures || 0), nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null, impact: String(row.impact || "none"), latencyMs: Number(row.last_latency_ms || 0) };
  });
}

export function buildAlertSummary(rows: Array<Record<string, unknown>>): AlertSummary {
  const counts = new Map(rows.map((row) => [String(row.alert_status), Number(row.count || 0)]));
  return { pending: counts.get("pending") || 0, retry: counts.get("retry") || 0, manualReview: counts.get("manual_review") || 0 };
}
