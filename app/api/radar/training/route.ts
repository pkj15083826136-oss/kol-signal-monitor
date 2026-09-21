import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  if (!isMonitorAuthorized(request, typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "")) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const rows = await env.DB.prepare(`SELECT r.id,r.chain,r.token_address,r.signal_type,r.rule_version,r.model_version,r.first_seen_at,r.pool_created_at,r.market_cap,r.liquidity,r.volume_24h,r.holders,r.buyers,r.sellers,r.smart_money_count,r.security_score,r.narrative_score,r.momentum_score,r.total_score,r.ai_decision,r.ai_confidence,o.horizon,o.observed_at,o.net_return_bps,o.max_upside_bps,o.max_drawdown_bps,o.sellable,o.liquidity_removed,o.zeroed,o.data_freshness_ms FROM radar_signals r LEFT JOIN trade_outcomes o ON o.radar_signal_id=r.id ORDER BY r.first_seen_at DESC,o.observed_at ASC LIMIT 5000`).all<Record<string, unknown>>();
  return Response.json({ schemaVersion: "radar-training-v1", generatedAt: new Date().toISOString(), rows: rows.results }, { headers: { "Cache-Control": "no-store" } });
}
