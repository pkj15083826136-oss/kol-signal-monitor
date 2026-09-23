import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { enrichRadarCandidate } from "@/lib/radar/enrichment";
import { normalizeRadarCandidate } from "@/lib/radar/intake";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, unknown>; const monitor = typeof runtime.MONITOR_SECRET === "string" ? runtime.MONITOR_SECRET : "";
  if (!isMonitorAuthorized(request, monitor)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  if (runtime.FEATURE_RADAR_READONLY_ENRICHMENT !== "true") return Response.json({ error: "feature_disabled" }, { status: 403 });
  let body: Record<string, unknown> = {}; try { body = await request.json() as Record<string, unknown>; } catch { /* default batch */ }
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 5)); const now = new Date().toISOString();
  const rows = await env.DB.prepare(`SELECT r.*,COALESCE((SELECT source FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1),'radar_backfill') source_name,COALESCE((SELECT source_event_id FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1),'backfill:'||r.id) source_event_id FROM radar_signals r LEFT JOIN radar_enrichment_state e ON e.radar_signal_id=r.id WHERE e.radar_signal_id IS NULL OR (e.terminal=0 AND (e.next_retry_at IS NULL OR e.next_retry_at<=?)) ORDER BY r.first_seen_at DESC LIMIT ?`).bind(now, limit).all<Record<string, unknown>>();
  const results = [];
  for (const row of rows.results) {
    const raw = (() => { try { return JSON.parse(String(row.raw_input_json || "{}")) as Record<string, unknown>; } catch { return {}; } })();
    const candidate = normalizeRadarCandidate({ ...raw, source: row.source_name, sourceEventId: row.source_event_id, chain: row.chain, tokenAddress: row.token_address, pairAddress: row.pair_address, dexId: row.dex_id, routerId: row.router_id, factoryAddress: row.factory_address, name: row.name, symbol: row.symbol, firstSeenAt: row.first_seen_at, poolCreatedAt: row.pool_created_at, price: row.price, marketCap: row.market_cap, liquidity: row.liquidity, volume24h: row.volume_24h, holders: row.holders, buyers: row.buyers, sellers: row.sellers, smartMoneyCount: row.smart_money_count, dataFetchedAt: row.updated_at, rawSnapshot: raw });
    if (!candidate) { results.push({ id: row.id, status: "PARSE_FAILED" }); continue; }
    results.push({ id: row.id, ...(await enrichRadarCandidate(env.DB, Number(row.id), candidate, runtime).catch((error) => ({ status: "RETRY_SCHEDULED", error: error instanceof Error ? error.message : "UNKNOWN" }))) });
  }
  return Response.json({ ok: true, processed: results.length, results });
}
