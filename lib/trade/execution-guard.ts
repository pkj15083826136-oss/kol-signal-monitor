import type { QuoteChain, TradeQuote } from "@/lib/trade/quote";

export type ExecutionFlags = { testnet: boolean; mainnet: boolean; mainnetChains: Record<QuoteChain, boolean> };
export type ExecutionContext = { network: "testnet" | "mainnet"; chain: QuoteChain; balance: string; now?: number };

export function executionBlockReasons(quote: TradeQuote, flags: ExecutionFlags, context: ExecutionContext): string[] {
  const reasons = [...quote.blockReasons];
  if (quote.blocked) reasons.push("报价风控未通过");
  if (new Date(quote.expiresAt).getTime() <= (context.now ?? Date.now())) reasons.push("报价已过期");
  if (quote.chain !== context.chain) reasons.push("钱包网络与报价不匹配");
  if (!/^\d+$/.test(context.balance) || BigInt(context.balance) < BigInt(quote.sellAmount)) reasons.push("余额不足");
  if (context.network === "testnet" && !flags.testnet) reasons.push("测试网交易未开放");
  if (context.network === "mainnet" && (!flags.mainnet || !flags.mainnetChains[context.chain])) reasons.push("该链主网广播未开放");
  return [...new Set(reasons)];
}

export function exactApprovalAmount(quote: TradeQuote, currentAllowance: string): string | null {
  if (!quote.transaction.spender) return null;
  if (!/^\d+$/.test(currentAllowance)) throw new Error("INVALID_ALLOWANCE");
  return BigInt(currentAllowance) >= BigInt(quote.sellAmount) ? null : quote.sellAmount;
}
