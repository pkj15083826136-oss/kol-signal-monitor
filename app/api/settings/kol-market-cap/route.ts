import { env } from "cloudflare:workers";
import { DEFAULT_KOL_ALERT_MAX_MARKET_CAP, parseMarketCapLimit } from "@/lib/market-cap-policy";

export const dynamic = "force-dynamic";
async function currentValue() { const row = await env.DB?.prepare("SELECT value,updated_at FROM system_settings WHERE key='KOL_ALERT_MAX_MARKET_CAP'").first<{ value: string; updated_at: string }>().catch(() => null); return { value: parseMarketCapLimit(row?.value ?? (env as unknown as Record<string, unknown>).KOL_ALERT_MAX_MARKET_CAP, DEFAULT_KOL_ALERT_MAX_MARKET_CAP), updatedAt: row?.updated_at ?? null }; }
export async function GET() { return Response.json(await currentValue(), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const db = env.DB; if (!db) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const runtime = env as unknown as Record<string, unknown>; const userId = request.headers.get("oai-authenticated-user-id") || ""; const adminId = typeof runtime.SITE_ADMIN_USER_ID === "string" ? runtime.SITE_ADMIN_USER_ID : "";
  if (!adminId || userId !== adminId) return Response.json({ error: "admin_required" }, { status: 403 });
  let body: { value?: unknown }; try { body = await request.json() as { value?: unknown }; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const value = parseMarketCapLimit(body.value, 0); if (value < 100_000 || value > 100_000_000_000) return Response.json({ error: "invalid_market_cap_limit" }, { status: 400 });
  const now = new Date().toISOString(); await db.prepare("INSERT INTO system_settings (key,value,updated_at,updated_by) VALUES ('KOL_ALERT_MAX_MARKET_CAP',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(String(value), now, userId).run();
  return Response.json({ value, updatedAt: now });
}
