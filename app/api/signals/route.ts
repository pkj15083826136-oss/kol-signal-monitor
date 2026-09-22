import { env } from "cloudflare:workers";
import { getMarketData } from "@/lib/market";
import { isRejectedTokenIdentity, verifiedTokenIdentity } from "@/lib/token-identity";
import { isMatureBaseAsset } from "@/lib/signal-policy";
import { d1Bindings, d1Integer, d1Text } from "@/lib/d1-values";
import { buildAlertSummary, buildChainHealth, buildSourceHealth } from "@/lib/ops-status";
import { DEFAULT_KOL_ALERT_MAX_MARKET_CAP, parseMarketCapLimit } from "@/lib/market-cap-policy";
import { decodeSignalCursor, encodeSignalCursor, signalPageLimit } from "@/lib/signal-pagination";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const backfillAttempts = new Map<string, number>();

function mapSignal(row: Row) {
  const identity = verifiedTokenIdentity(String(row.chain), String(row.token_address), String(row.name), String(row.symbol));
  return { id: Number(row.id), chain: String(row.chain), tokenAddress: String(row.token_address), name: identity.name, symbol: identity.symbol, logo: String(row.logo || ""), threshold: Number(row.threshold), holderCount: Number(row.holder_count), price: Number(row.price), marketCap: Number(row.market_cap), liquidity: Number(row.liquidity), holders: Number(row.holders), volume24h: Number(row.volume_24h), gmgnTheme: String(row.gmgn_theme), aiAnalysis: String(row.ai_analysis), walletNames: JSON.parse(String(row.wallet_names_json || "[]")), createdAt: String(row.alerted_at), signalOrigin: String(row.signal_origin || "kol_monitor"), radarScore: row.radar_score == null ? null : Number(row.radar_score) };
}
async function marketCapLimit(db: D1Database) {
  const row = await db.prepare("SELECT value FROM system_settings WHERE key='KOL_ALERT_MAX_MARKET_CAP'").first<{ value: string }>().catch(() => null);
  const runtime = env as unknown as Record<string, unknown>;
  return parseMarketCapLimit(row?.value ?? runtime.KOL_ALERT_MAX_MARKET_CAP, DEFAULT_KOL_ALERT_MAX_MARKET_CAP);
}

export async function GET(request: Request) {
  const db = env.DB; if (!db) return Response.json({ error: "DB binding 未配置" }, { status: 500 });
  const url = new URL(request.url); const cursor = decodeSignalCursor(url.searchParams.get("cursor")); const chain = url.searchParams.get("chain")?.trim().toLowerCase() || "all"; const query = url.searchParams.get("q")?.trim() || ""; const history = url.searchParams.get("history") === "1" || query.length > 0; const limit = signalPageLimit(Number(url.searchParams.get("limit")));
  const cap = await marketCapLimit(db); const where: string[] = ["alert_status != 'suppressed'", "signal_origin != 'radar'"]; const bindings: unknown[] = [];
  if (!history) { where.push("market_cap > 0 AND market_cap < ?"); bindings.push(cap); }
  if (["sol", "bsc", "base", "robinhood"].includes(chain)) { where.push("chain = ?"); bindings.push(chain); }
  if (query) { where.push("(lower(name) LIKE ? OR lower(symbol) LIKE ? OR lower(token_address) LIKE ?)"); const like = `%${query.toLowerCase()}%`; bindings.push(like, like, like); }
  if (cursor) { where.push("(alerted_at < ? OR (alerted_at = ? AND id < ?))"); bindings.push(cursor.alertedAt, cursor.alertedAt, cursor.id); }
  const rows = await db.prepare(`SELECT id,chain,token_address,name,symbol,logo,threshold,holder_count,price,market_cap,liquidity,holders,volume_24h,gmgn_theme,ai_analysis,wallet_names_json,alerted_at,signal_origin,radar_score FROM signals WHERE ${where.join(" AND ")} ORDER BY alerted_at DESC,id DESC LIMIT ?`).bind(...bindings, limit + 1).all<Row>();
  const page = rows.results.slice(0, limit); const now = Date.now();
  const stale = page.filter((row) => !(Number(row.liquidity) && Number(row.holders) && Number(row.volume_24h)) && now - (backfillAttempts.get(`${row.chain}:${row.token_address}`) || 0) > 6 * 60 * 60 * 1000).slice(0, 2);
  await Promise.all(stale.map(async (row) => { backfillAttempts.set(`${row.chain}:${row.token_address}`, now); const market = await getMarketData(String(row.chain), String(row.token_address)).catch(() => null); if (!market || market.filterMarketCap === null || market.filterMarketCap >= cap) return; const next = { name: market.name || String(row.name), symbol: market.symbol || String(row.symbol), logo: market.logo || String(row.logo || ""), marketCap: market.marketCap || Number(row.market_cap), liquidity: market.liquidity || Number(row.liquidity), holders: market.holders ?? Number(row.holders), volume24h: market.volume24h || Number(row.volume_24h) }; Object.assign(row, { name: next.name, symbol: next.symbol, logo: next.logo, market_cap: next.marketCap, liquidity: next.liquidity, holders: next.holders, volume_24h: next.volume24h }); await db.prepare("UPDATE signals SET name=?,symbol=?,logo=?,market_cap=?,liquidity=?,holders=?,volume_24h=? WHERE id=?").bind(...d1Bindings("signals.api_backfill", { name: d1Text(next.name), symbol: d1Text(next.symbol), logo: d1Text(next.logo), market_cap: d1Integer(next.marketCap), liquidity: d1Integer(next.liquidity), holders: d1Integer(next.holders), volume_24h: d1Integer(next.volume24h), id: d1Integer(row.id) })).run(); }));
  const [run, chainRows, sourceRows, alertRows] = await Promise.all([db.prepare("SELECT status,finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ status: string; finished_at: string }>(), db.prepare("SELECT chain,status,finished_at FROM monitor_runs WHERE chain != '' AND id IN (SELECT MAX(id) FROM monitor_runs WHERE chain != '' GROUP BY chain)").all<Row>(), db.prepare("SELECT source,chain,status,last_attempt_at,last_success_at,last_error,consecutive_failures,next_retry_at,impact,last_latency_ms FROM source_health ORDER BY source,chain").all<Row>(), db.prepare("SELECT alert_status,COUNT(*) count FROM signals WHERE threshold > 0 AND alert_status IN ('pending','retry','manual_review') GROUP BY alert_status").all<Row>()]);
  const last = page.at(-1); const nextCursor = rows.results.length > limit && last ? encodeSignalCursor({ alertedAt: String(last.alerted_at), id: Number(last.id) }) : null;
  await db.prepare("INSERT INTO api_usage_metrics (kind,source,request_count,cache_hits,filtered_saved,last_known_good_uses,captured_at) VALUES (?,?,1,0,0,0,?)").bind(cursor ? "pagination" : "first_page", "signals", new Date().toISOString()).run().catch(() => undefined);
  return Response.json({ signals: page.map(mapSignal).filter((signal) => !isRejectedTokenIdentity(signal.chain, signal.tokenAddress) && !isMatureBaseAsset(signal.symbol)), nextCursor, hasMore: Boolean(nextCursor), lastRun: run?.finished_at ?? null, monitorOk: run?.status === "success", chainHealth: buildChainHealth(chainRows.results), sourceHealth: buildSourceHealth(sourceRows.results), alertSummary: buildAlertSummary(alertRows.results), metrics: { requestKind: cursor ? "pagination" : "first_page", dbRows: page.length, marketApiCalls: stale.length, filteredBeforeEnrichment: true, cap } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
