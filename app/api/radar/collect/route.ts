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
  const candidates = Array.isArray((body as { candidates?: unknown[] })?.candidates) ? (body as { candidates: unknown[] }).candidates.slice(0, 30).map(normalizeRadarCandidate).filter((candidate) => candidate !== null) : [];
  if (!candidates.length) return Response.json({ error: "candidates_required" }, { status: 400 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const results = [];
  for (const candidate of candidates) {
    const gate = hardFilter(candidate);
    const review = gate.passed ? await reviewRadarCandidate(candidate, typeof source.XAI_API_KEY === "string" ? source.XAI_API_KEY : undefined) : radarAiFallback();
    results.push(await persistRadarCandidate(env.DB, candidate, review));
  }
  return Response.json({ ok: true, count: results.length, results });
}
