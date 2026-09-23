import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";
import { radarAiFallback } from "@/lib/radar/ai";
import { claimRadarNarrativeTask, loadTerminalRadarNarrative, normalizeRadarCandidate, persistRadarCandidate } from "@/lib/radar/intake";
import { enrichRadarCandidate } from "@/lib/radar/enrichment";

export const dynamic = "force-dynamic";
function text(value: unknown, fallback = "", max = 300) { return String(value ?? fallback).slice(0, max); }
function count(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0; }
function isoOrNull(value: unknown) { if (!value) return null; const parsed = new Date(String(value)); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
async function recordIngest(db: D1Database, input: { source: string; eventId: string; signalId?: number; chain?: string; token?: string; outcome: string; reason?: string; observedAt?: string }, now: string) {
  await db.prepare(`INSERT INTO radar_ingest_events (source,source_event_id,radar_signal_id,chain,token_address,outcome,reason,observed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_event_id) DO UPDATE SET radar_signal_id=COALESCE(radar_ingest_events.radar_signal_id,excluded.radar_signal_id),outcome=CASE WHEN radar_ingest_events.outcome='CREATED' THEN radar_ingest_events.outcome ELSE excluded.outcome END,reason=COALESCE(excluded.reason,radar_ingest_events.reason)`).bind(input.source, input.eventId, input.signalId ?? null, input.chain || null, input.token || null, input.outcome, input.reason || null, input.observedAt || now, now).run();
}
export async function POST(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  const monitorSecret = typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "";
  const collectorSecret = typeof source.AVE_COLLECTOR_SECRET === "string" ? source.AVE_COLLECTOR_SECRET : "";
  if (!isMonitorAuthorized(request, monitorSecret) && !isMonitorAuthorized(request, collectorSecret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 30) : [];
  const parsedCandidates = rawCandidates.map((raw, index) => ({ raw, index, candidate: normalizeRadarCandidate(raw) }));
  const candidates = parsedCandidates.flatMap((item) => item.candidate ? [item.candidate] : []);
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const sourceName = String(payload.source || candidates[0]?.source || "radar_collector").slice(0, 80); const status = payload.status === "healthy" ? "healthy" : payload.status === "login_expired" ? "blocked" : payload.status === "error" ? "error" : "degraded"; const now = new Date().toISOString();
  const collector = payload.collector && typeof payload.collector === "object" ? payload.collector as Record<string, unknown> : {};
  await env.DB.prepare(`INSERT INTO source_health (source,chain,status,last_attempt_at,last_success_at,last_failure_at,consecutive_failures,last_latency_ms,last_error,next_retry_at,impact) VALUES (?, 'all', ?, ?, ?, ?, ?, 0, ?, NULL, 'radar_discovery') ON CONFLICT(source,chain) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN excluded.status='healthy' THEN excluded.last_success_at ELSE source_health.last_success_at END,last_failure_at=CASE WHEN excluded.status='healthy' THEN source_health.last_failure_at ELSE excluded.last_failure_at END,consecutive_failures=CASE WHEN excluded.status='healthy' THEN 0 ELSE source_health.consecutive_failures+1 END,last_error=excluded.last_error`).bind(sourceName, status, now, status === "healthy" ? now : null, status === "healthy" ? null : now, status === "healthy" ? 0 : 1, status === "healthy" ? null : String(payload.error || status).slice(0, 300)).run();
  await env.DB.prepare(`INSERT INTO collector_status (source,instance_id,connection_status,login_status,websocket_status,last_heartbeat_at,last_event_at,last_upload_at,captured_count,uploaded_count,dedup_count,upload_failed_count,parse_failed_count,unsupported_count,invalid_count,last_error,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET instance_id=excluded.instance_id,connection_status=excluded.connection_status,login_status=excluded.login_status,websocket_status=excluded.websocket_status,last_heartbeat_at=excluded.last_heartbeat_at,last_event_at=COALESCE(excluded.last_event_at,collector_status.last_event_at),last_upload_at=COALESCE(excluded.last_upload_at,collector_status.last_upload_at),captured_count=MAX(collector_status.captured_count,excluded.captured_count),uploaded_count=MAX(collector_status.uploaded_count,excluded.uploaded_count),dedup_count=MAX(collector_status.dedup_count,excluded.dedup_count),upload_failed_count=MAX(collector_status.upload_failed_count,excluded.upload_failed_count),parse_failed_count=MAX(collector_status.parse_failed_count,excluded.parse_failed_count),unsupported_count=MAX(collector_status.unsupported_count,excluded.unsupported_count),invalid_count=MAX(collector_status.invalid_count,excluded.invalid_count),last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(sourceName, text(collector.instanceId, "unknown", 100), text(collector.connectionStatus, "unknown", 40), text(collector.loginStatus, "unknown", 40), text(collector.websocketStatus, "unknown", 40), now, isoOrNull(collector.lastEventAt), candidates.length ? now : isoOrNull(collector.lastUploadAt), count(collector.capturedCount), count(collector.uploadedCount) + candidates.length, count(collector.dedupCount), count(collector.uploadFailedCount), count(collector.parseFailedCount) + parsedCandidates.filter((item) => !item.candidate).length, count(collector.unsupportedCount), count(collector.invalidCount), status === "healthy" ? null : text(payload.error || status), now).run();
  for (const item of parsedCandidates.filter((entry) => !entry.candidate)) { const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {}; await recordIngest(env.DB, { source: text(raw.source, sourceName, 80), eventId: text(raw.sourceEventId, `invalid:${now}:${item.index}`, 200), chain: text(raw.chain, "", 30), token: text(raw.tokenAddress, "", 150), outcome: "PARSE_FAILED", reason: "缺少受支持链、Token地址或稳定来源事件ID", observedAt: isoOrNull(raw.firstSeenAt) || now }, now); }
  if (!candidates.length) return Response.json({ ok: true, heartbeat: true, count: 0 });
  const results = [];
  for (const candidate of candidates) {
    const existing = await env.DB.prepare("SELECT id FROM radar_signals WHERE chain=? AND token_address=?").bind(candidate.chain, candidate.chain === "sol" ? candidate.tokenAddress : candidate.tokenAddress.toLowerCase()).first<{ id: number }>();
    const stored = await loadTerminalRadarNarrative(env.DB, candidate);
    if (stored) {
      const persisted = await persistRadarCandidate(env.DB, candidate, stored); await recordIngest(env.DB, { source: candidate.source, eventId: candidate.sourceEventId, signalId: persisted.id, chain: candidate.chain, token: candidate.tokenAddress, outcome: existing ? "DUPLICATE" : "CREATED", observedAt: candidate.firstSeenAt }, now);
      const enrichment = source.FEATURE_RADAR_READONLY_ENRICHMENT === "true" ? await enrichRadarCandidate(env.DB, persisted.id, candidate, source).catch((error) => ({ skipped: false, status: "RETRY_SCHEDULED", error: error instanceof Error ? error.message : "UNKNOWN" })) : { skipped: true, status: "DISABLED" };
      results.push({ ...persisted, narrativeDeduplicated: true, enrichment });
      continue;
    }
    const pending = radarAiFallback("PENDING", null, candidate.firstSeenAt);
    const reserved = await persistRadarCandidate(env.DB, candidate, pending);
    await recordIngest(env.DB, { source: candidate.source, eventId: candidate.sourceEventId, signalId: reserved.id, chain: candidate.chain, token: candidate.tokenAddress, outcome: existing ? "MERGED" : "CREATED", observedAt: candidate.firstSeenAt }, now);
    const enrichment = source.FEATURE_RADAR_READONLY_ENRICHMENT === "true" ? await enrichRadarCandidate(env.DB, reserved.id, candidate, source).catch((error) => ({ skipped: false, status: "RETRY_SCHEDULED", error: error instanceof Error ? error.message : "UNKNOWN" })) : { skipped: true, status: "DISABLED" };
    const claim = await claimRadarNarrativeTask(env.DB, reserved.id, candidate);
    if (!claim.claimed) {
      results.push({ ...reserved, narrativeStatus: "RUNNING", narrativeDeduplicated: true, enrichment });
      continue;
    }
    const frozenCandidate = { ...candidate, sourceProjectDescription: claim.sourceProjectDescription, sourceDescriptionRaw: claim.sourceDescriptionRaw };
    const review = await reviewRadarCandidate(frozenCandidate, typeof source.XAI_API_KEY === "string" ? source.XAI_API_KEY : undefined, fetch, { entryPoint: "radar_first_discovery", claimFingerprint: claim.fingerprint });
    results.push({ ...(await persistRadarCandidate(env.DB, candidate, review)), narrativeDeduplicated: false, enrichment });
  }
  return Response.json({ ok: true, count: results.length, results });
}
