import type { QuoteAdapter, TradeQuote } from "@/lib/trade/quote";

type RecordValue = Record<string, unknown>;
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
export const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

export const jupiterAdapter: QuoteAdapter<RecordValue> = {
  provider: "jupiter",
  buildRequest(request, apiKey) {
    const params = new URLSearchParams({ inputMint: request.sellToken, outputMint: request.buyToken, amount: request.sellAmount, slippageBps: String(request.slippageBps), restrictIntermediateTokens: "true" });
    return { url: `https://api.jup.ag/swap/v1/quote?${params}`, headers: { Accept: "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) } };
  },
  parse(payload, request, now = Date.now()): TradeQuote {
    const plan = Array.isArray(payload.routePlan) ? payload.routePlan.map(record) : [];
    const route = plan.map((entry) => text(record(entry.swapInfo).label)).filter(Boolean);
    return {
      chain: "sol", chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", provider: "jupiter",
      sellToken: text(payload.inputMint) || request.sellToken, buyToken: text(payload.outputMint) || request.buyToken, sellAmount: text(payload.inAmount) || request.sellAmount,
      expectedOut: text(payload.outAmount), minimumOut: text(payload.otherAmountThreshold), price: text(payload.swapUsdValue), slippageBps: Number(payload.slippageBps) || request.slippageBps,
      priceImpactPct: number(payload.priceImpactPct) * 100, gasEstimate: "0", priorityFee: text(payload.prioritizationFeeLamports) || "0", route, expiresAt: new Date(now + 25_000).toISOString(),
      transaction: { to: JUPITER_PROGRAM, spender: null, value: "0", calldata: text(payload.swapTransaction) || "quote-only" }, blocked: false, blockReasons: [], providerPayload: payload,
    };
  },
};

export function buildJupiterSwapRequest(quote: TradeQuote, userPublicKey: string, apiKey: string) {
  if (quote.provider !== "jupiter" || quote.chain !== "sol" || quote.blocked) throw new Error("INVALID_JUPITER_QUOTE");
  if (!quote.providerPayload || typeof quote.providerPayload !== "object") throw new Error("MISSING_JUPITER_QUOTE_PAYLOAD");
  const payload = quote.providerPayload as RecordValue;
  if (quote.chainId !== "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" || quote.transaction.to !== JUPITER_PROGRAM ||
      text(payload.inputMint) !== quote.sellToken || text(payload.outputMint) !== quote.buyToken || text(payload.inAmount) !== quote.sellAmount ||
      text(payload.outAmount) !== quote.expectedOut || text(payload.otherAmountThreshold) !== quote.minimumOut) throw new Error("JUPITER_QUOTE_TAMPERED");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(userPublicKey)) throw new Error("INVALID_SOLANA_WALLET");
  return {
    url: "https://api.jup.ag/swap/v1/swap",
    headers: { Accept: "application/json", "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ quoteResponse: quote.providerPayload, userPublicKey, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
  };
}
