import { getBatchMarketData } from "@/lib/batch-market";
import { getMarketData } from "@/lib/market";

export const dynamic = "force-dynamic";

type TokenInput = { chain?: unknown; address?: unknown };
const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);

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
  const primary = await getBatchMarketData(tokens);
  const items = await Promise.all(primary.map(async (item) => {
    if (item.source !== "unavailable") return item;
    const fallback = await getMarketData(item.chain, item.address).catch(() => null);
    if (!fallback || !(fallback.price > 0 || fallback.marketCap > 0 || fallback.liquidity > 0 || fallback.volume24h > 0)) return item;
    return { ...item, price: fallback.price, marketCap: fallback.marketCap, liquidity: fallback.liquidity, volume24h: fallback.volume24h, source: "Ave/GMGN fallback" };
  }));
  return Response.json({ items, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=2, stale-while-revalidate=10" } });
}
