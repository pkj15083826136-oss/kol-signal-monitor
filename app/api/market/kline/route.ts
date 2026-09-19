import { getKlineData } from "@/lib/market";
import { isKlineInterval } from "@/lib/kline";

export const dynamic = "force-dynamic";

const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = (url.searchParams.get("chain") || "").trim().toLowerCase();
  const address = (url.searchParams.get("address") || "").trim();
  const interval = Number(url.searchParams.get("interval"));
  if (!allowedChains.has(chain) || address.length < 10 || address.length > 128 || !isKlineInterval(interval)) {
    return Response.json({ error: "K线参数无效" }, { status: 400 });
  }
  const result = await getKlineData(chain, address, interval);
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}
