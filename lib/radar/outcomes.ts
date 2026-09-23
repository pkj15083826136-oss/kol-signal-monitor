import { classifyOutcome } from "@/lib/radar/learning";

export const OUTCOME_HORIZONS = [{ key: "5m", ms: 5 * 60_000 }, { key: "30m", ms: 30 * 60_000 }, { key: "1h", ms: 60 * 60_000 }, { key: "4h", ms: 4 * 60 * 60_000 }, { key: "24h", ms: 24 * 60 * 60_000 }, { key: "7d", ms: 7 * 24 * 60 * 60_000 }] as const;
export function dueOutcomeHorizons(firstSeenAt: string, now: string, completed: string[]) { const elapsed = Date.parse(now) - Date.parse(firstSeenAt); const done = new Set(completed); return OUTCOME_HORIZONS.filter((item) => elapsed >= item.ms && !done.has(item.key)).map((item) => item.key); }
export type OutcomeTrackingTier = "ai_selected" | "ordinary_rejected" | "invalid_asset";
export function trackingTier(row: { status: string; ai_decision: string; hard_filter_passed: number; identity_status: string }): OutcomeTrackingTier {
  if (row.ai_decision === "APPROVE" || row.status === "approved") return "ai_selected";
  if (row.hard_filter_passed === 0 || ["INVALID", "REJECTED", "MISMATCH"].includes(row.identity_status)) return "invalid_asset";
  return "ordinary_rejected";
}
export function outcomeHorizonsForTier(tier: OutcomeTrackingTier) {
  if (tier === "ai_selected") return new Set(["5m", "30m", "1h", "4h", "24h", "7d"]);
  if (tier === "ordinary_rejected") return new Set(["1h", "24h", "7d"]);
  return new Set(["24h", "7d"]);
}

export async function processDueRadarOutcomes(db: D1Database, market: (chain: string, address: string) => Promise<{ price: number; marketCap: number; liquidity: number; holders: number | null; sourceStatus: Record<string, unknown> }>, now = new Date().toISOString(), limit = 2) {
  const rows = await db.prepare("SELECT id,chain,token_address,first_seen_at,price,status,ai_decision,hard_filter_passed,identity_status,(SELECT raw_snapshot_json FROM radar_signal_sources s WHERE s.radar_signal_id=radar_signals.id ORDER BY observed_at ASC,id ASC LIMIT 1) frozen_input_json FROM radar_signals ORDER BY first_seen_at LIMIT 100").all<{ id: number; chain: string; token_address: string; first_seen_at: string; price: string; status: string; ai_decision: string; hard_filter_passed: number; identity_status: string; frozen_input_json: string | null }>(); let saved = 0;
  for (const row of rows.results) {
    await db.prepare("INSERT INTO narrative_samples (radar_signal_id,frozen_input_json,first_signal_at,outcome_group,multiple_kind,created_at,updated_at) VALUES (?,?,?,'UNKNOWN','UNVERIFIED_MARKET_MULTIPLE',?,?) ON CONFLICT(radar_signal_id) DO NOTHING").bind(row.id, row.frozen_input_json || "{}", row.first_seen_at, now, now).run();
    if (saved >= limit) continue; const completed = await db.prepare("SELECT horizon FROM trade_outcomes WHERE radar_signal_id=?").bind(row.id).all<{ horizon: string }>(); const allowed = outcomeHorizonsForTier(trackingTier(row)); const due = dueOutcomeHorizons(row.first_seen_at, now, completed.results.map((item) => item.horizon)).filter((horizon) => allowed.has(horizon)); if (!due.length) continue; const snapshot = await market(row.chain, row.token_address).catch(() => null); if (!snapshot || !(snapshot.price > 0)) continue; const entry = Number(row.price); const multiple = entry > 0 ? snapshot.price / entry : null; const bps = multiple === null ? null : Math.round((multiple - 1) * 10_000); const source = Object.entries(snapshot.sourceStatus).find(([, state]) => state === "healthy")?.[0] || "market_adapter";
    for (const horizon of due) { await db.prepare("INSERT INTO trade_outcomes (radar_signal_id,horizon,observed_at,net_return_bps,max_upside_bps,max_drawdown_bps,sellable,liquidity_removed,zeroed,paper_result_json,data_freshness_ms,market_price,market_cap,liquidity,holders,quote_status,source,source_timestamp,multiple_kind) VALUES (?,?,?,?,?,?,?,?,?,'{}',?,?,?,?,?,'NOT_QUOTED',?,?, 'UNVERIFIED_MARKET_MULTIPLE') ON CONFLICT(radar_signal_id,horizon) DO NOTHING").bind(row.id, horizon, now, bps, bps === null ? null : Math.max(0, bps), bps === null ? null : Math.min(0, bps), null, snapshot.liquidity <= 0 ? 1 : 0, snapshot.price <= 0 ? 1 : 0, 0, String(snapshot.price), snapshot.marketCap || null, snapshot.liquidity || null, snapshot.holders, source, now).run(); saved += 1; }
    const aggregate = await db.prepare("SELECT MAX(net_return_bps) max_return_bps,MAX(liquidity_removed) liquidity_removed,MAX(zeroed) zeroed FROM trade_outcomes WHERE radar_signal_id=?").bind(row.id).first<{ max_return_bps: number | null; liquidity_removed: number; zeroed: number }>();
    const observedMultiple = aggregate?.max_return_bps === null || aggregate?.max_return_bps === undefined ? null : 1 + Number(aggregate.max_return_bps) / 10_000;
    const outcomeGroup = classifyOutcome(observedMultiple, Boolean(aggregate?.liquidity_removed || aggregate?.zeroed));
    await db.prepare("UPDATE narrative_samples SET outcome_group=?,multiple_kind='UNVERIFIED_MARKET_MULTIPLE',updated_at=? WHERE radar_signal_id=?").bind(outcomeGroup, now, row.id).run();
  }
  return saved;
}
