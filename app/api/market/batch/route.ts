import type { BatchMarketItem } from "@/lib/batch-market";
import { env } from "cloudflare:workers";
import { mergeSnapshot, persistedMarketSnapshot } from "@/lib/market-live";
import type { MarketData } from "@/lib/market";
import { readApiCache, tokenCacheKey } from "@/lib/external-api-control";

export const dynamic = "force-dynamic";

type TokenInput = { chain?: unknown; address?: unknown };
const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);
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
  await Promise.all(tokens.map(async (token) => {
    const cached = await readApiCache<{ market: MarketData; capturedAt: string }>(db, tokenCacheKey("market", "snapshot", token.chain, token.address), true);
    if (!cached.hit || !cached.value?.market) return;
    const market = cached.value.market; const capturedAt = cached.value.capturedAt; const key = keyFor(token.chain, token.address);
    const fields = { ...(market.price > 0 ? { price: "market-cache" } : {}), ...(market.priceChange24h !== null ? { priceChange24h: "market-cache" } : {}), ...(market.marketCap > 0 ? { marketCap: market.marketCapSource || "market-cache" } : {}), ...(market.liquidity > 0 ? { liquidity: "market-cache" } : {}), ...(market.volume24h > 0 ? { volume24h: "market-cache" } : {}), ...(market.holders !== null ? { holders: market.holderSource || "market-cache" } : {}) };
    const item: BatchMarketItem = { chain: token.chain, address: token.address, tokenAddress: token.address, pairAddress: market.pairAddress, symbol: market.symbol, decimals: null, price: market.price, priceChange24h: market.priceChange24h, change24hSource: market.change24hSource, change24hUpdatedAt: market.change24hUpdatedAt, marketCap: market.marketCap, marketCapKind: market.marketCapKind, marketCapSource: market.marketCapSource, marketDataConflict: market.marketDataConflict, marketCapCandidates: market.marketCapCandidates, liquidity: market.liquidity, holders: market.holders, holderSource: market.holderSource, holderUpdatedAt: market.holderUpdatedAt, volume24h: market.volume24h, updatedAt: capturedAt, sourceTimestamp: capturedAt, receivedAt: capturedAt, source: cached.stale ? "cached:market-stale" : "cached:market", identityVerified: market.identityVerified, fieldSources: fields, fieldUpdatedAt: Object.fromEntries(Object.keys(fields).map((field) => [field, capturedAt])), staleFields: cached.stale ? ["price", "priceChange24h", "marketCap", "liquidity", "volume24h", "holders"] : [], conflictFields: market.marketDataConflict ? ["marketCap"] : [] };
    result.set(key, result.has(key) ? mergeSnapshot(result.get(key), item) : item);
  }));
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
  const persisted = await persistedSnapshots(tokens);
  const now = new Date().toISOString();
  const items = tokens.map((token): BatchMarketItem => persisted.get(keyFor(token.chain, token.address)) ?? {
    chain: token.chain, address: token.address, tokenAddress: token.address, pairAddress: "", symbol: "", decimals: null,
    price: 0, priceChange24h: null, marketCap: 0, liquidity: 0, holders: null, volume24h: 0,
    updatedAt: now, sourceTimestamp: now, receivedAt: now, source: "unavailable", identityVerified: false,
    fieldSources: {}, fieldUpdatedAt: {}, staleFields: ["price", "priceChange24h", "marketCap", "liquidity", "volume24h", "holders"], conflictFields: [],
  });
  const hits = items.filter((item) => item.source !== "unavailable").length;
  if (env.DB) await env.DB.prepare("INSERT INTO api_usage_metrics (kind,source,request_count,cache_hits,filtered_saved,last_known_good_uses,captured_at) VALUES ('market_cycle','batch_market',0,?,?,?,?)").bind(hits, tokens.length, hits, now).run().catch(() => undefined);
  return Response.json({ items, serverTime: now, cacheOnly: true }, { headers: { "Cache-Control": "public, max-age=2, stale-while-revalidate=15" } });
}
