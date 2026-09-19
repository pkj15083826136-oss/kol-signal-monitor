import { env } from "cloudflare:workers";
import { jupiterAdapter, JUPITER_PROGRAM } from "@/lib/trade/adapters/jupiter";
import { zeroXAdapter } from "@/lib/trade/adapters/zero-x";
import { applyQuoteRisk, validateQuoteRequest, type QuoteRequest, type QuoteRiskInput } from "@/lib/trade/quote";
import { tradingFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const chainIds = { sol: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", bsc: "56", base: "8453", robinhood: "4663" } as const;
const splitList = (value?: string) => (value || "").split(",").map((item) => item.trim()).filter(Boolean);

export async function POST(request: Request) {
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  if (!flags.tradeQuote) return Response.json({ error: "只读报价功能尚未开放" }, { status: 403 });
  let input: QuoteRequest;
  try { input = await request.json() as QuoteRequest; } catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  const errors = validateQuoteRequest(input);
  if (errors.length) return Response.json({ error: errors.join("；") }, { status: 400 });
  const adapter = input.chain === "sol" ? jupiterAdapter : zeroXAdapter;
  const apiKey = input.chain === "sol" ? env.JUPITER_API_KEY : env.ZEROX_API_KEY;
  if (!apiKey) return Response.json({ error: `${adapter.provider} API 尚未配置` }, { status: 503 });
  try {
    const upstream = adapter.buildRequest(input, apiKey);
    const response = await fetch(upstream.url, { headers: upstream.headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return Response.json({ error: "报价源暂不可用" }, { status: 502 });
    const payload = await response.json() as Record<string, unknown>;
    const quote = adapter.parse(payload, input);
    const issues = (payload.issues && typeof payload.issues === "object") ? payload.issues as Record<string, unknown> : {};
    const risk: QuoteRiskInput = { simulationComplete: issues.simulationIncomplete !== true };
    const allowedTargets = input.chain === "sol" ? [JUPITER_PROGRAM] : splitList(env.ZEROX_ALLOWED_TARGETS);
    const allowedSpenders = input.chain === "sol" ? [] : splitList(env.ZEROX_ALLOWED_SPENDERS);
    const checked = applyQuoteRisk(quote, risk, { expectedChainId: chainIds[input.chain], expectedSellToken: input.sellToken, expectedBuyToken: input.buyToken, allowedTargets, allowedSpenders });
    return Response.json({ quote: checked }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "第三方报价服务失败" }, { status: 502 }); }
}
