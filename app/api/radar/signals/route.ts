import { env } from "cloudflare:workers";
import { loadRadarDashboard } from "@/lib/radar/view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ error: "DB binding 未配置" }, { status: 500 });
  const url = new URL(request.url); const offset = Number(url.searchParams.get("offset") || 0); const limit = Number(url.searchParams.get("limit") || 40);
  try { return Response.json(await loadRadarDashboard(env.DB, { offset, limit }), { headers: { "Cache-Control": "no-store, max-age=0" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "土狗雷达数据暂时不可用" }, { status: 503 }); }
}
