import { getKlineData } from "@/lib/market";
import { isKlineInterval } from "@/lib/kline";

export const dynamic = "force-dynamic";

const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = (url.searchParams.get("chain") || "").trim().toLowerCase();
  const address = (url.searchParams.get("address") || "").trim();
  const interval = Number(url.searchParams.get("interval"));
  const requestedLimit = Number(url.searchParams.get("limit"));
  if (!allowedChains.has(chain) || address.length < 10 || address.length > 128 || !isKlineInterval(interval)) {
    return Response.json({ error: "K线参数无效" }, { status: 400 });
  }
  const limit = Number.isFinite(requestedLimit) ? Math.max(2, Math.min(500, Math.round(requestedLimit))) : undefined;
  const result = await getKlineData(chain, address, interval, limit);
  return Response.json(result, { headers: { "Cache-Control": limit && limit <= 5 ? "public, max-age=2, stale-while-revalidate=5" : "public, max-age=30, stale-while-revalidate=120" } });
}
