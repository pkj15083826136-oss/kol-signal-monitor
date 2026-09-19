import { env } from "cloudflare:workers";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import { buildJupiterSwapRequest } from "@/lib/trade/adapters/jupiter";
import type { TradeQuote } from "@/lib/trade/quote";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input: { quote?: TradeQuote; walletAddress?: string; network?: "testnet" | "mainnet" };
  try { input = await request.json() as typeof input; } catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  const quote = input.quote;
  if (!quote || quote.chain !== "sol" || quote.provider !== "jupiter") return Response.json({ error: "仅支持准备已校验的 Jupiter 报价" }, { status: 400 });
  if (quote.blocked || new Date(quote.expiresAt).getTime() <= Date.now()) return Response.json({ error: "报价已被阻止或过期" }, { status: 409 });
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  const enabled = input.network === "testnet" ? flags.tradeTestnet : input.network === "mainnet" && flags.tradeMainnet && flags.tradeMainnetChains.sol;
  if (!enabled) return Response.json({ error: "Solana 交易准备功能未开放" }, { status: 403 });
  if (!env.JUPITER_API_KEY) return Response.json({ error: "Jupiter API 尚未配置" }, { status: 503 });
  try {
    const upstream = buildJupiterSwapRequest(quote, input.walletAddress || "", env.JUPITER_API_KEY);
    const response = await fetch(upstream.url, { method: "POST", headers: upstream.headers, body: upstream.body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return Response.json({ error: "Jupiter 交易准备失败" }, { status: 502 });
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.swapTransaction !== "string" || !payload.swapTransaction) return Response.json({ error: "Jupiter 未返回可签名交易" }, { status: 502 });
    return Response.json({ swapTransaction: payload.swapTransaction, lastValidBlockHeight: payload.lastValidBlockHeight ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Jupiter 交易准备服务失败" }, { status: 502 }); }
}
