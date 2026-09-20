import { describe, expect, it } from "vitest";
import zeroXFixture from "./fixtures/zero-x-quote.json";
import jupiterFixture from "./fixtures/jupiter-quote.json";
import { zeroXAdapter } from "@/lib/trade/adapters/zero-x";
import { buildJupiterSwapRequest, JUPITER_PROGRAM, jupiterAdapter } from "@/lib/trade/adapters/jupiter";
import { applyQuoteRisk, quoteScopeKey, quoteWalletContextMatches, validateQuoteRequest, type QuoteRequest } from "@/lib/trade/quote";

const evmRequest: QuoteRequest = { chain: "base", sellToken: zeroXFixture.sellToken, buyToken: zeroXFixture.buyToken, sellAmount: "1000000", taker: "0x5555555555555555555555555555555555555555", slippageBps: 100, walletNamespace: "eip155", walletChainId: "8453" };
const solRequest: QuoteRequest = { chain: "sol", sellToken: jupiterFixture.inputMint, buyToken: jupiterFixture.outputMint, sellAmount: "100000000", taker: "11111111111111111111111111111111", slippageBps: 100, walletNamespace: "solana", walletChainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };

describe("quote adapters and safety gate", () => {
  it("normalizes official 0x and Jupiter fixture shapes", () => {
    const zeroX = zeroXAdapter.parse(zeroXFixture, evmRequest, 1_000_000);
    const jupiter = jupiterAdapter.parse(jupiterFixture, solRequest, 1_000_000);
    expect(zeroX).toMatchObject({ provider: "0x", minimumOut: "495000000000000", route: ["Uniswap_V3", "0x_RFQ"] });
    expect(jupiter).toMatchObject({ provider: "jupiter", minimumOut: "13860000", transaction: { to: JUPITER_PROGRAM } });
    const swap = buildJupiterSwapRequest(jupiter, "11111111111111111111111111111111", "fixture-key");
    expect(swap.url).toContain("/swap/v1/swap");
    expect(swap.body).toContain("dynamicComputeUnitLimit");
    expect(() => buildJupiterSwapRequest({ ...jupiter, minimumOut: "1" }, "11111111111111111111111111111111", "fixture-key")).toThrow("JUPITER_QUOTE_TAMPERED");
  });
  it("rejects wrong chain, tokens, targets, expiry, minimum received and simulation failure", () => {
    const quote = zeroXAdapter.parse(zeroXFixture, evmRequest, 1_000_000);
    const checked = applyQuoteRisk({ ...quote, chainId: "56", buyToken: "0x9999999999999999999999999999999999999999", minimumOut: "999999999999999999", expiresAt: new Date(1_000_000).toISOString() }, { simulationComplete: false }, {
      expectedChainId: "8453", expectedSellToken: evmRequest.sellToken, expectedBuyToken: evmRequest.buyToken,
      allowedTargets: [zeroXFixture.transaction.to], allowedSpenders: [zeroXFixture.issues.allowance.spender], now: 1_000_001,
    });
    expect(checked.blocked).toBe(true);
    expect(checked.blockReasons).toEqual(expect.arrayContaining(["报价链不匹配", "买入代币不匹配", "最少获得数量无效", "报价已过期", "交易模拟失败或不完整"]));
  });
  it("blocks honeypot, high tax, unsellable and excessive price impact", () => {
    const quote = zeroXAdapter.parse({ ...zeroXFixture, estimatedPriceImpact: "15" }, evmRequest, Date.now());
    const checked = applyQuoteRisk(quote, { honeypot: true, sellTaxPct: 20, sellable: false }, { expectedChainId: "8453", allowedTargets: [zeroXFixture.transaction.to], allowedSpenders: [zeroXFixture.issues.allowance.spender] });
    expect(checked.blockReasons).toEqual(expect.arrayContaining(["疑似 honeypot", "代币不可卖出", "代币税率过高", "价格影响过高"]));
  });
  it("validates addresses, amount and slippage before any upstream call", () => {
    expect(validateQuoteRequest({ ...evmRequest, sellToken: "bad", sellAmount: "0", slippageBps: 999 })).toHaveLength(3);
  });
  it("rejects a quote when wallet namespace or chain differs and invalidates its scope after switching", () => {
    expect(quoteWalletContextMatches(evmRequest)).toBe(true);
    expect(validateQuoteRequest({ ...evmRequest, walletChainId: "56" })).toContain("当前钱包网络与代币网络不一致");
    expect(validateQuoteRequest({ ...solRequest, walletNamespace: "eip155" })).toContain("当前钱包网络与代币网络不一致");
    expect(quoteScopeKey(evmRequest)).not.toBe(quoteScopeKey({ ...evmRequest, walletChainId: "56" }));
  });
});
