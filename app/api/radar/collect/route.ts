import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { hardFilter } from "@/lib/radar/policy";
import { radarAiFallback } from "@/lib/radar/ai";
import { reviewRadarCandidate } from "@/lib/radar/reviewer";
import { normalizeRadarCandidate, persistRadarCandidate } from "@/lib/radar/intake";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  if (!isMonitorAuthorized(request, typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "")) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 30).map(normalizeRadarCandidate).filter((candidate) => candidate !== null) : [];
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const sourceName = String(payload.source || candidates[0]?.source || "radar_collector").slice(0, 80); const status = payload.status === "healthy" ? "healthy" : payload.status === "login_expired" ? "blocked" : payload.status === "error" ? "error" : "degraded"; const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO source_health (source,chain,status,last_attempt_at,last_success_at,last_failure_at,consecutive_failures,last_latency_ms,last_error,next_retry_at,impact) VALUES (?, 'all', ?, ?, ?, ?, ?, 0, ?, NULL, 'radar_discovery') ON CONFLICT(source,chain) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN excluded.status='healthy' THEN excluded.last_success_at ELSE source_health.last_success_at END,last_failure_at=CASE WHEN excluded.status='healthy' THEN source_health.last_failure_at ELSE excluded.last_failure_at END,consecutive_failures=CASE WHEN excluded.status='healthy' THEN 0 ELSE source_health.consecutive_failures+1 END,last_error=excluded.last_error`).bind(sourceName, status, now, status === "healthy" ? now : null, status === "healthy" ? null : now, status === "healthy" ? 0 : 1, status === "healthy" ? null : String(payload.error || status).slice(0, 300)).run();
  if (!candidates.length) return Response.json({ ok: true, heartbeat: true, count: 0 });
  const results = [];
  for (const candidate of candidates) {
    const gate = hardFilter(candidate);
    const review = gate.passed ? await reviewRadarCandidate(candidate, typeof source.XAI_API_KEY === "string" ? source.XAI_API_KEY : undefined) : radarAiFallback();
    results.push(await persistRadarCandidate(env.DB, candidate, review));
  }
  return Response.json({ ok: true, count: results.length, results });
}
