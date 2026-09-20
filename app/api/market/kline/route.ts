import { getKlineData } from "@/lib/market";
import { isKlineInterval, normalizeKlineLimit } from "@/lib/kline";
import { env } from "cloudflare:workers";
import { recordKlineSample } from "@/lib/provider-samples";

export const dynamic = "force-dynamic";

const allowedChains = new Set(["sol", "bsc", "base", "robinhood"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = (url.searchParams.get("chain") || "").trim().toLowerCase();
  const address = (url.searchParams.get("address") || "").trim();
  const interval = Number(url.searchParams.get("interval"));
  const requestedLimit = normalizeKlineLimit(url.searchParams.get("limit"));
  if (!allowedChains.has(chain) || address.length < 10 || address.length > 128 || !isKlineInterval(interval) || (requestedLimit !== undefined && !Number.isFinite(requestedLimit))) {
    return Response.json({ error: "K线参数无效" }, { status: 400 });
  }
  const result = await getKlineData(chain, address, interval, requestedLimit);
  await recordKlineSample(env.DB, chain, address, interval, result).catch(() => undefined);
  return Response.json(result, { headers: { "Cache-Control": requestedLimit && requestedLimit <= 5 ? "public, max-age=2, stale-while-revalidate=5" : "public, max-age=30, stale-while-revalidate=120" } });
}
