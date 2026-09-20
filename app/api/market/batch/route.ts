import { getBatchMarketData, type BatchMarketItem } from "@/lib/batch-market";
import { getMarketData } from "@/lib/market";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type TokenInput = { chain?: unknown; address?: unknown };
const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);
const lastAvailable = new Map<string, BatchMarketItem>();

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
  const apiKey = (env as unknown as Record<string, unknown>).AVE_API_KEY;
  const primary = await getBatchMarketData(tokens, typeof apiKey === "string" ? apiKey : "");
  const items = await Promise.all(primary.map(async (item) => {
    const key = `${item.chain}:${item.chain === "sol" ? item.address : item.address.toLowerCase()}`;
    if (item.source !== "unavailable" && (tokens.length > 1 || (item.holders ?? 0) > 0)) { lastAvailable.set(key, item); return item; }
    const fallback = await getMarketData(item.chain, item.address).catch(() => null);
    if (!fallback || !(fallback.price > 0 || fallback.marketCap > 0 || fallback.liquidity > 0 || (fallback.holders ?? 0) > 0 || fallback.volume24h > 0)) {
      const cached = lastAvailable.get(key);
      return cached ? { ...cached, source: `cached:${cached.source}` } : item;
    }
    const now = new Date().toISOString();
    const available = { ...item, tokenAddress: item.address, pairAddress: fallback.pairAddress || item.pairAddress, symbol: fallback.symbol || item.symbol, price: fallback.price || item.price, priceChange24h: fallback.priceChange24h ?? item.priceChange24h, change24hSource: fallback.change24hSource ?? item.change24hSource, change24hUpdatedAt: fallback.change24hUpdatedAt ?? item.change24hUpdatedAt, marketCap: fallback.marketCap || item.marketCap, marketCapKind: fallback.marketCapKind ?? item.marketCapKind, marketCapSource: fallback.marketCapSource ?? item.marketCapSource, marketDataConflict: fallback.marketDataConflict, marketCapCandidates: fallback.marketCapCandidates, liquidity: fallback.liquidity || item.liquidity, holders: fallback.holders ?? item.holders, holderSource: fallback.holderSource ?? item.holderSource, holderUpdatedAt: fallback.holderUpdatedAt ?? item.holderUpdatedAt, volume24h: fallback.volume24h || item.volume24h, sourceTimestamp: now, receivedAt: now, updatedAt: now, identityVerified: fallback.identityVerified, source: item.source === "unavailable" ? "Ave/GMGN fallback" : `${item.source}+token-detail`, fieldSources: { ...item.fieldSources, ...(fallback.price > 0 ? { price: fallback.marketCapSource || "token-detail" } : {}), ...(fallback.priceChange24h !== null ? { priceChange24h: fallback.change24hSource || "token-detail" } : {}), ...(fallback.marketCap > 0 ? { marketCap: fallback.marketCapSource || "token-detail" } : {}), ...(fallback.liquidity > 0 ? { liquidity: "token-detail" } : {}), ...(fallback.volume24h > 0 ? { volume24h: "token-detail" } : {}), ...(fallback.holders !== null ? { holders: fallback.holderSource || "token-detail" } : {}) }, fieldUpdatedAt: { ...item.fieldUpdatedAt, price: now, ...(fallback.priceChange24h !== null ? { priceChange24h: fallback.change24hUpdatedAt || now } : {}), ...(fallback.marketCap > 0 ? { marketCap: now } : {}), ...(fallback.liquidity > 0 ? { liquidity: now } : {}), ...(fallback.volume24h > 0 ? { volume24h: now } : {}), ...(fallback.holders !== null ? { holders: fallback.holderUpdatedAt || now } : {}) }, staleFields: [], conflictFields: fallback.marketDataConflict ? ["marketCap" as const] : [] };
    lastAvailable.set(key, available);
    return available;
  }));
  return Response.json({ items, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=2, stale-while-revalidate=10" } });
}
