import type { QuoteAdapter, TradeQuote } from "@/lib/trade/quote";

type RecordValue = Record<string, unknown>;
const chainIds = { bsc: "56", base: "8453", robinhood: "4663" } as const;
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export const zeroXAdapter: QuoteAdapter<RecordValue> = {
  provider: "0x",
  buildRequest(request, apiKey) {
    const params = new URLSearchParams({ chainId: chainIds[request.chain as keyof typeof chainIds] || "", sellToken: request.sellToken, buyToken: request.buyToken, sellAmount: request.sellAmount, taker: request.taker, slippageBps: String(request.slippageBps) });
    return { url: `https://api.0x.org/swap/allowance-holder/quote?${params}`, headers: { Accept: "application/json", "0x-version": "v2", ...(apiKey ? { "0x-api-key": apiKey } : {}) } };
  },
  parse(payload, request, now = Date.now()): TradeQuote {
    const transaction = record(payload.transaction); const allowance = record(record(payload.issues).allowance); const route = record(payload.route);
    const fills = Array.isArray(route.fills) ? route.fills.map(record).map((fill) => text(fill.source)).filter(Boolean) : [];
    const expectedOut = text(payload.buyAmount); const minimumOut = text(payload.minBuyAmount) || expectedOut;
    const simulationIncomplete = record(payload.issues).simulationIncomplete === true;
    return {
      chain: request.chain, chainId: String(payload.chainId || chainIds[request.chain as keyof typeof chainIds] || ""), provider: "0x",
      sellToken: text(payload.sellToken) || request.sellToken, buyToken: text(payload.buyToken) || request.buyToken, sellAmount: text(payload.sellAmount) || request.sellAmount,
      expectedOut, minimumOut, price: text(payload.price), slippageBps: request.slippageBps, priceImpactPct: number(payload.estimatedPriceImpact),
      gasEstimate: text(transaction.gas), priorityFee: text(transaction.gasPrice), route: fills, expiresAt: new Date(now + 25_000).toISOString(),
      transaction: { to: text(transaction.to), spender: text(allowance.spender) || text(payload.allowanceTarget) || null, value: text(transaction.value) || "0", calldata: text(transaction.data) },
      blocked: simulationIncomplete, blockReasons: simulationIncomplete ? ["交易模拟失败或不完整"] : [],
    };
  },
};
