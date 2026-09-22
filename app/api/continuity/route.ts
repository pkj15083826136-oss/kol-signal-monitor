import { env } from "cloudflare:workers";
import { emptyContinuityStatus, loadContinuityStatus } from "@/lib/continuity";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!env.DB) return Response.json(emptyContinuityStatus(), { status: 503 });
  const status = await loadContinuityStatus(env.DB, env as unknown as Record<string, unknown>).catch(() => emptyContinuityStatus());
  return Response.json(status, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" } });
}
