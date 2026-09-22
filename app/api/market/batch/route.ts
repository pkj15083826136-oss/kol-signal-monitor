import { getBatchMarketData, type BatchMarketItem } from "@/lib/batch-market";
import { getMarketData } from "@/lib/market";
import { env } from "cloudflare:workers";
import { mergeSnapshot, persistedMarketSnapshot } from "@/lib/market-live";
import { okxCredentialsFromEnv } from "@/lib/providers/okx";
import { recordMarketSamples } from "@/lib/provider-samples";

export const dynamic = "force-dynamic";

type TokenInput = { chain?: unknown; address?: unknown };
const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);
const lastAvailable = new Map<string, BatchMarketItem>();
function keyFor(chain: string, address: string) { return `${chain}:${chain === "sol" ? address : address.toLowerCase()}`; }

async function persistedSnapshots(tokens: Array<{ chain: string; address: string }>) {
  const db = env.DB;
  if (!db || !tokens.length) return new Map<string, BatchMarketItem>();
  const where = tokens.map((token) => `(chain = ? AND ${token.chain === "sol" ? "token_address = ?" : "lower(token_address) = lower(?)"})`).join(" OR ");
  const bindings = tokens.flatMap((token) => [token.chain, token.address]);
  const rows = await db.prepare(`SELECT chain, token_address, price, market_cap, liquidity, volume_24h, holders, alerted_at FROM signals WHERE alert_status != 'suppressed' AND (${where}) ORDER BY alerted_at DESC`).bind(...bindings).all<Record<string, unknown>>();
  const result = new Map<string, BatchMarketItem>();
  for (const row of rows.results) {
    const chain = String(row.chain); const address = String(row.token_address); const key = keyFor(chain, address);
    if (!result.has(key)) result.set(key, persistedMarketSnapshot({ chain, address, price: Number(row.price), marketCap: Number(row.market_cap), liquidity: Number(row.liquidity), volume24h: Number(row.volume_24h), holders: Number(row.holders) > 0 ? Number(row.holders) : null, capturedAt: String(row.alerted_at) }));
  }
  return result;
}

export async function POST(request: Request) {
  let body: { tokens?: TokenInput[] };
  try { body = await request.json() as { tokens?: TokenInput[] }; }
  catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Array.isArray(body.tokens) || body.tokens.length > 30) return Response.json({ error: "每批最多 30 个代币" }, { status: 400 });
  const tokens = body.tokens.flatMap((item) => {
    const chain = typeof item.chain === "string" ? item.chain.trim().toLowerCase() : "";
    const address = typeof item.address === "string" ? item.address.trim() : "";
    return allowedChains.has(chain) && address.length >= 10 && address.length <= 128 ? [{ chain, address }] : [];
  });
  const runtime = env as unknown as Record<string, unknown>;
  const [primary, persisted] = await Promise.all([getBatchMarketData(tokens, okxCredentialsFromEnv(runtime)), persistedSnapshots(tokens)]);
  const items = await Promise.all(primary.map(async (item) => {
    const key = keyFor(item.chain, item.address);
    const base = persisted.has(key) ? mergeSnapshot(persisted.get(key), item) : item;
    if (base.source !== "unavailable" && (tokens.length > 1 || (base.holders ?? 0) > 0)) { lastAvailable.set(key, base); return base; }
    const fallback = await getMarketData(item.chain, item.address).catch(() => null);
    if (!fallback || !(fallback.price > 0 || fallback.marketCap > 0 || fallback.liquidity > 0 || (fallback.holders ?? 0) > 0 || fallback.volume24h > 0)) {
      const cached = lastAvailable.get(key);
      return cached ? { ...cached, source: cached.source.startsWith("cached:") ? cached.source : `cached:${cached.source}` } : base;
    }
    const now = new Date().toISOString();
    const available = { ...base, tokenAddress: base.address, pairAddress: fallback.pairAddress || base.pairAddress, symbol: fallback.symbol || base.symbol, price: fallback.price || base.price, priceChange24h: fallback.priceChange24h ?? base.priceChange24h, change24hSource: fallback.change24hSource ?? base.change24hSource, change24hUpdatedAt: fallback.change24hUpdatedAt ?? base.change24hUpdatedAt, marketCap: fallback.marketCap || base.marketCap, marketCapKind: fallback.marketCapKind ?? base.marketCapKind, marketCapSource: fallback.marketCapSource ?? base.marketCapSource, marketDataConflict: fallback.marketDataConflict, marketCapCandidates: fallback.marketCapCandidates, liquidity: fallback.liquidity || base.liquidity, holders: fallback.holders ?? base.holders, holderSource: fallback.holderSource ?? base.holderSource, holderUpdatedAt: fallback.holderUpdatedAt ?? base.holderUpdatedAt, volume24h: fallback.volume24h || base.volume24h, sourceTimestamp: now, receivedAt: now, updatedAt: now, identityVerified: fallback.identityVerified, source: base.source === "unavailable" ? "OKX/GMGN/Dex fallback" : `${base.source}+token-detail`, fieldSources: { ...base.fieldSources, ...(fallback.price > 0 ? { price: fallback.marketCapSource || "token-detail" } : {}), ...(fallback.priceChange24h !== null ? { priceChange24h: fallback.change24hSource || "token-detail" } : {}), ...(fallback.marketCap > 0 ? { marketCap: fallback.marketCapSource || "token-detail" } : {}), ...(fallback.liquidity > 0 ? { liquidity: "token-detail" } : {}), ...(fallback.volume24h > 0 ? { volume24h: "token-detail" } : {}), ...(fallback.holders !== null ? { holders: fallback.holderSource || "token-detail" } : {}) }, fieldUpdatedAt: { ...base.fieldUpdatedAt, ...(fallback.price > 0 ? { price: now } : {}), ...(fallback.priceChange24h !== null ? { priceChange24h: fallback.change24hUpdatedAt || now } : {}), ...(fallback.marketCap > 0 ? { marketCap: now } : {}), ...(fallback.liquidity > 0 ? { liquidity: now } : {}), ...(fallback.volume24h > 0 ? { volume24h: now } : {}), ...(fallback.holders !== null ? { holders: fallback.holderUpdatedAt || now } : {}) }, staleFields: base.staleFields, conflictFields: fallback.marketDataConflict ? ["marketCap" as const] : base.conflictFields };
    lastAvailable.set(key, available);
    return available;
  }));
  await recordMarketSamples(env.DB, items).catch(() => undefined);
  if (env.DB) await env.DB.prepare("INSERT INTO api_usage_metrics (kind,source,request_count,cache_hits,filtered_saved,last_known_good_uses,captured_at) VALUES ('market_cycle','batch_market',?,?,?,?,?)").bind(tokens.length, items.filter((item) => item.source.startsWith("cached:")).length, 0, items.filter((item) => item.source.startsWith("cached:")).length, new Date().toISOString()).run().catch(() => undefined);
  return Response.json({ items, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=2, stale-while-revalidate=10" } });
}
