import { env } from "cloudflare:workers";
import { isMonitorAuthorized } from "@/lib/monitor-auth";
import { backfillRadarNarratives } from "@/lib/radar/backfill";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  const monitorSecret = typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "";
  const collectorSecret = typeof source.AVE_COLLECTOR_SECRET === "string" ? source.AVE_COLLECTOR_SECRET : "";
  if (!isMonitorAuthorized(request, monitorSecret) && !isMonitorAuthorized(request, collectorSecret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { /* use defaults */ }
  const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : 50;
  return Response.json(await backfillRadarNarratives(env.DB, typeof source.XAI_API_KEY === "string" ? source.XAI_API_KEY : undefined, limit));
}
