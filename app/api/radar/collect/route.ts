import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";
import { loadCompletedRadarNarrative, normalizeRadarCandidate, persistRadarCandidate } from "@/lib/radar/intake";

export const dynamic = "force-dynamic";
function text(value: unknown, fallback = "", max = 300) { return String(value ?? fallback).slice(0, max); }
function count(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0; }
function isoOrNull(value: unknown) { if (!value) return null; const parsed = new Date(String(value)); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
export async function POST(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  const monitorSecret = typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "";
  const collectorSecret = typeof source.AVE_COLLECTOR_SECRET === "string" ? source.AVE_COLLECTOR_SECRET : "";
  if (!isMonitorAuthorized(request, monitorSecret) && !isMonitorAuthorized(request, collectorSecret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 30).map(normalizeRadarCandidate).filter((candidate) => candidate !== null) : [];
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const sourceName = String(payload.source || candidates[0]?.source || "radar_collector").slice(0, 80); const status = payload.status === "healthy" ? "healthy" : payload.status === "login_expired" ? "blocked" : payload.status === "error" ? "error" : "degraded"; const now = new Date().toISOString();
  const collector = payload.collector && typeof payload.collector === "object" ? payload.collector as Record<string, unknown> : {};
  await env.DB.prepare(`INSERT INTO source_health (source,chain,status,last_attempt_at,last_success_at,last_failure_at,consecutive_failures,last_latency_ms,last_error,next_retry_at,impact) VALUES (?, 'all', ?, ?, ?, ?, ?, 0, ?, NULL, 'radar_discovery') ON CONFLICT(source,chain) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN excluded.status='healthy' THEN excluded.last_success_at ELSE source_health.last_success_at END,last_failure_at=CASE WHEN excluded.status='healthy' THEN source_health.last_failure_at ELSE excluded.last_failure_at END,consecutive_failures=CASE WHEN excluded.status='healthy' THEN 0 ELSE source_health.consecutive_failures+1 END,last_error=excluded.last_error`).bind(sourceName, status, now, status === "healthy" ? now : null, status === "healthy" ? null : now, status === "healthy" ? 0 : 1, status === "healthy" ? null : String(payload.error || status).slice(0, 300)).run();
  await env.DB.prepare(`INSERT INTO collector_status (source,instance_id,connection_status,login_status,websocket_status,last_heartbeat_at,last_event_at,last_upload_at,captured_count,uploaded_count,dedup_count,last_error,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET instance_id=excluded.instance_id,connection_status=excluded.connection_status,login_status=excluded.login_status,websocket_status=excluded.websocket_status,last_heartbeat_at=excluded.last_heartbeat_at,last_event_at=COALESCE(excluded.last_event_at,collector_status.last_event_at),last_upload_at=COALESCE(excluded.last_upload_at,collector_status.last_upload_at),captured_count=MAX(collector_status.captured_count,excluded.captured_count),uploaded_count=MAX(collector_status.uploaded_count,excluded.uploaded_count),dedup_count=MAX(collector_status.dedup_count,excluded.dedup_count),last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(sourceName, text(collector.instanceId, "unknown", 100), text(collector.connectionStatus, "unknown", 40), text(collector.loginStatus, "unknown", 40), text(collector.websocketStatus, "unknown", 40), now, isoOrNull(collector.lastEventAt), candidates.length ? now : isoOrNull(collector.lastUploadAt), count(collector.capturedCount), count(collector.uploadedCount) + candidates.length, count(collector.dedupCount), status === "healthy" ? null : text(payload.error || status), now).run();
  if (!candidates.length) return Response.json({ ok: true, heartbeat: true, count: 0 });
  const results = [];
  for (const candidate of candidates) {
    const stored = await loadCompletedRadarNarrative(env.DB, candidate);
    const review = stored ?? await reviewRadarCandidate(candidate, typeof source.XAI_API_KEY === "string" ? source.XAI_API_KEY : undefined);
    results.push(await persistRadarCandidate(env.DB, candidate, review));
  }
  return Response.json({ ok: true, count: results.length, results });
}
