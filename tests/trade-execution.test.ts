import { describe, expect, it, vi } from "vitest";
import { executionBlockReasons, exactApprovalAmount } from "@/lib/trade/execution-guard";
import { executeEvmQuote, executeSolanaTransaction } from "@/lib/trade/browser-executor";
import { transitionTrade } from "@/lib/trade/state-machine";
import { normalizeTradeRecord, validateTradeRecordInput } from "@/lib/trade/records";
import type { TradeQuote } from "@/lib/trade/quote";
import { decimalToBaseUnits, percentageOfBalance } from "@/lib/trade/amounts";

const hash = `0x${"1".repeat(64)}`;
const quote: TradeQuote = {
  chain: "base", chainId: "8453", provider: "0x", sellToken: `0x${"2".repeat(40)}`, buyToken: `0x${"3".repeat(40)}`,
  sellAmount: "100", expectedOut: "200", minimumOut: "190", price: "2", slippageBps: 50, priceImpactPct: 1,
  gasEstimate: "1", priorityFee: "0", route: ["0x"], expiresAt: "2099-01-01T00:00:00.000Z",
  transaction: { to: `0x${"4".repeat(40)}`, spender: `0x${"5".repeat(40)}`, value: "0", calldata: "0x1234" }, blocked: false, blockReasons: [],
};
const closedFlags = { testnet: false, mainnet: false, mainnetChains: { sol: false, bsc: false, base: false, robinhood: false } };

describe("trade execution safety", () => {
  it("requires both global and per-chain mainnet flags", () => {
    expect(executionBlockReasons(quote, closedFlags, { network: "mainnet", chain: "base", balance: "100" })).toContain("该链主网广播未开放");
    expect(executionBlockReasons(quote, { ...closedFlags, mainnet: true }, { network: "mainnet", chain: "base", balance: "100" })).toContain("该链主网广播未开放");
    expect(executionBlockReasons(quote, { ...closedFlags, mainnet: true, mainnetChains: { ...closedFlags.mainnetChains, base: true } }, { network: "mainnet", chain: "base", balance: "100" })).toEqual([]);
  });
  it("blocks insufficient balance and expired quotes", () => {
    expect(executionBlockReasons({ ...quote, expiresAt: "2020-01-01T00:00:00.000Z" }, closedFlags, { network: "testnet", chain: "base", balance: "99" })).toEqual(expect.arrayContaining(["报价已过期", "余额不足", "测试网交易未开放"]));
  });
  it("uses an exact allowance and never requests unlimited approval", () => {
    expect(exactApprovalAmount(quote, "0")).toBe("100");
    expect(exactApprovalAmount(quote, "100")).toBeNull();
  });
  it("converts amounts without floating point and reserves native fees", () => {
    expect(decimalToBaseUnits("1.000001", 6)).toBe("1000001");
    expect(() => decimalToBaseUnits("1.0000001", 6)).toThrow("TOO_MANY_DECIMAL_PLACES");
    expect(percentageOfBalance("1000", 100, "50")).toBe("950");
  });
  it("keeps approval and swap as separate wallet confirmations", async () => {
    const provider = { request: vi.fn().mockResolvedValueOnce(hash).mockResolvedValueOnce(hash) };
    const states: string[] = [];
    const result = await executeEvmQuote(provider, quote, `0x${"6".repeat(40)}`, "0", { waitForReceipt: async () => ({ status: "success" }), onState: (state) => states.push(state) });
    expect(provider.request).toHaveBeenCalledTimes(2);
    expect(states).toEqual(["awaiting_approval", "awaiting_signature", "confirming", "confirmed"]);
    expect(result.approvalTxHash).toBe(hash);
  });
  it("stops after rejected signing and after approval failure", async () => {
    const rejected = { request: vi.fn().mockRejectedValue({ code: 4001 }) };
    await expect(executeEvmQuote(rejected, { ...quote, transaction: { ...quote.transaction, spender: null } }, `0x${"6".repeat(40)}`, "0", { waitForReceipt: async () => ({ status: "success" }) })).rejects.toThrow("USER_REJECTED");
    const approvalFailed = { request: vi.fn().mockResolvedValue(hash) };
    await expect(executeEvmQuote(approvalFailed, quote, `0x${"6".repeat(40)}`, "0", { waitForReceipt: async () => ({ status: "reverted" }) })).rejects.toThrow("APPROVAL_FAILED");
    expect(approvalFailed.request).toHaveBeenCalledTimes(1);
  });
  it("reports failed swaps, RPC failures, and Solana confirmation failures", async () => {
    const swapFailed = { request: vi.fn().mockResolvedValue(hash) };
    await expect(executeEvmQuote(swapFailed, { ...quote, transaction: { ...quote.transaction, spender: null } }, `0x${"6".repeat(40)}`, "100", { waitForReceipt: async () => ({ status: "reverted" }) })).rejects.toThrow("TRANSACTION_FAILED");
    await expect(executeEvmQuote({ request: vi.fn().mockRejectedValue(new Error("RPC_DOWN")) }, { ...quote, transaction: { ...quote.transaction, spender: null } }, `0x${"6".repeat(40)}`, "100", { waitForReceipt: async () => ({ status: "success" }) })).rejects.toThrow("RPC_DOWN");
    await expect(executeSolanaTransaction({ publicKey: "wallet", signAndSendTransaction: async () => "sig", confirmTransaction: async () => "failed" }, "base64tx")).rejects.toThrow("SOLANA_TRANSACTION_FAILED");
  });
  it("enforces legal state transitions", () => {
    expect(transitionTrade("idle", "QUOTE_READY")).toBe("quoted");
    expect(transitionTrade("quoted", "APPROVAL_REQUIRED")).toBe("awaiting_approval");
    expect(() => transitionTrade("idle", "TX_SENT")).toThrow("INVALID_TRADE_TRANSITION");
  });
  it("normalizes EVM record identifiers without changing integer strings", () => {
    const record = normalizeTradeRecord({ chain: "base", network: "testnet", txHash: hash.toUpperCase(), walletAddress: `0x${"A".repeat(40)}`, sellToken: quote.sellToken, buyToken: quote.buyToken, sellAmount: "100", minimumOut: "190", status: "confirmed", createdAt: "2026-09-19T00:00:00.000Z" });
    expect(record.txHash).toBe(hash);
    expect(record.walletAddress).toBe(`0x${"a".repeat(40)}`);
    expect(record.sellAmount).toBe("100");
  });
  it("rejects secrets and signed material at the transaction record boundary", () => {
    expect(validateTradeRecordInput({ privateKey: "never-store" })).toContain("请求不得包含密钥、助记词或签名材料");
    expect(validateTradeRecordInput({ signature: "signed-material" })).toContain("请求不得包含密钥、助记词或签名材料");
  });
});
