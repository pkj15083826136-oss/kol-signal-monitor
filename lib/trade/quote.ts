export type QuoteChain = "sol" | "bsc" | "base" | "robinhood";
export type QuoteProvider = "jupiter" | "0x";

export type QuoteRequest = {
  chain: QuoteChain; sellToken: string; buyToken: string; sellAmount: string; taker: string; slippageBps: number;
  walletNamespace: "solana" | "eip155"; walletChainId: string;
};
export type QuoteRiskInput = { honeypot?: boolean; buyTaxPct?: number; sellTaxPct?: number; sellable?: boolean; simulationComplete?: boolean };
export type TradeQuote = {
  chain: QuoteChain; chainId: string; provider: QuoteProvider; sellToken: string; buyToken: string; sellAmount: string;
  expectedOut: string; minimumOut: string; price: string; slippageBps: number; priceImpactPct: number;
  gasEstimate: string; priorityFee: string; route: string[]; expiresAt: string;
  transaction: { to: string; spender: string | null; value: string; calldata: string };
  blocked: boolean; blockReasons: string[];
  providerPayload?: unknown;
};

export type QuoteValidationPolicy = { expectedChainId: string; expectedSellToken?: string; expectedBuyToken?: string; allowedTargets: string[]; allowedSpenders: string[]; maxPriceImpactPct?: number; maxTaxPct?: number; now?: number };

const evmAddress = /^0x[a-fA-F0-9]{40}$/;
const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const digits = /^\d+$/;
export const quoteChainContext = {
  sol: { namespace: "solana", chainId: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
  bsc: { namespace: "eip155", chainId: "56" },
  base: { namespace: "eip155", chainId: "8453" },
  robinhood: { namespace: "eip155", chainId: "4663" },
} as const;

function bareChainId(value: string) { return value.includes(":") ? value.split(":").at(-1) || "" : value; }

export function quoteWalletContextMatches(request: Pick<QuoteRequest, "chain" | "walletNamespace" | "walletChainId">) {
  const expected = quoteChainContext[request.chain];
  return request.walletNamespace === expected.namespace && bareChainId(request.walletChainId) === expected.chainId;
}

export function quoteScopeKey(input: Pick<QuoteRequest, "chain" | "walletNamespace" | "walletChainId" | "taker">) {
  return `${input.chain}:${input.walletNamespace}:${bareChainId(input.walletChainId)}:${input.taker.toLowerCase()}`;
}

export function validateQuoteRequest(request: QuoteRequest): string[] {
  const reasons: string[] = [];
  const addressPattern = request.chain === "sol" ? solanaAddress : evmAddress;
  if (!addressPattern.test(request.sellToken) || !addressPattern.test(request.buyToken) || request.sellToken.toLowerCase() === request.buyToken.toLowerCase()) reasons.push("代币地址无效");
  if (!digits.test(request.sellAmount) || BigInt(request.sellAmount) <= BigInt(0)) reasons.push("卖出数量无效");
  if (!addressPattern.test(request.taker)) reasons.push("钱包地址无效");
  if (!quoteWalletContextMatches(request)) reasons.push("当前钱包网络与代币网络不一致");
  if (!Number.isInteger(request.slippageBps) || request.slippageBps < 1 || request.slippageBps > 500) reasons.push("滑点必须在 0.01%—5% 之间");
  return reasons;
}

export function applyQuoteRisk(quote: TradeQuote, risk: QuoteRiskInput, policy: QuoteValidationPolicy): TradeQuote {
  const reasons = [...quote.blockReasons];
  const normalized = (value: string) => value.toLowerCase();
  if (quote.chainId !== policy.expectedChainId) reasons.push("报价链不匹配");
  if (policy.expectedSellToken && normalized(quote.sellToken) !== normalized(policy.expectedSellToken)) reasons.push("卖出代币不匹配");
  if (policy.expectedBuyToken && normalized(quote.buyToken) !== normalized(policy.expectedBuyToken)) reasons.push("买入代币不匹配");
  if (!policy.allowedTargets.map(normalized).includes(normalized(quote.transaction.to))) reasons.push("交易目标不在允许列表");
  if (quote.transaction.spender && !policy.allowedSpenders.map(normalized).includes(normalized(quote.transaction.spender))) reasons.push("授权目标不在允许列表");
  if (!digits.test(quote.minimumOut) || BigInt(quote.minimumOut) <= BigInt(0) || BigInt(quote.minimumOut) > BigInt(quote.expectedOut)) reasons.push("最少获得数量无效");
  if (!quote.transaction.calldata || !quote.transaction.value.match(digits)) reasons.push("交易数据不完整");
  if (new Date(quote.expiresAt).getTime() <= (policy.now ?? Date.now())) reasons.push("报价已过期");
  if (quote.priceImpactPct > (policy.maxPriceImpactPct ?? 10)) reasons.push("价格影响过高");
  if (risk.honeypot) reasons.push("疑似 honeypot");
  if (risk.sellable === false) reasons.push("代币不可卖出");
  if (Math.max(risk.buyTaxPct || 0, risk.sellTaxPct || 0) > (policy.maxTaxPct ?? 10)) reasons.push("代币税率过高");
  if (risk.simulationComplete === false) reasons.push("交易模拟失败或不完整");
  return { ...quote, blocked: reasons.length > 0, blockReasons: [...new Set(reasons)] };
}

export interface QuoteAdapter<T = unknown> { readonly provider: QuoteProvider; buildRequest(request: QuoteRequest, apiKey?: string): { url: string; headers: Record<string, string> }; parse(payload: T, request: QuoteRequest, now?: number): TradeQuote; }
