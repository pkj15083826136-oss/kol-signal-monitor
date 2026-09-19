import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import type { TradeQuote } from "@/lib/trade/quote";
import { exactApprovalAmount } from "@/lib/trade/execution-guard";

export interface Eip1193Provider { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
export type ExecutionResult = { approvalTxHash: string | null; txHash: string; status: "confirmed" };
export type ExecutorHooks = { onState?: (state: string) => void; waitForReceipt: (hash: string) => Promise<{ status: "success" | "reverted" }> };

function isHash(value: unknown): value is string { return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value); }
function rejection(error: unknown) { return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 4001; }

export async function executeEvmQuote(provider: Eip1193Provider, quote: TradeQuote, wallet: string, allowance: string, hooks: ExecutorHooks): Promise<ExecutionResult> {
  if (quote.blocked) throw new Error("QUOTE_BLOCKED");
  if (new Date(quote.expiresAt).getTime() <= Date.now()) throw new Error("QUOTE_EXPIRED");
  let approvalTxHash: string | null = null;
  const approvalAmount = exactApprovalAmount(quote, allowance);
  try {
    if (approvalAmount && quote.transaction.spender) {
      hooks.onState?.("awaiting_approval");
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.transaction.spender as Hex, BigInt(approvalAmount)] });
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: quote.sellToken, data, value: "0x0" }] });
      if (!isHash(hash)) throw new Error("INVALID_APPROVAL_HASH");
      approvalTxHash = hash;
      const receipt = await hooks.waitForReceipt(hash);
      if (receipt.status !== "success") throw new Error("APPROVAL_FAILED");
    }
    hooks.onState?.("awaiting_signature");
    const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: quote.transaction.to, data: quote.transaction.calldata, value: `0x${BigInt(quote.transaction.value).toString(16)}` }] });
    if (!isHash(hash)) throw new Error("INVALID_TRANSACTION_HASH");
    hooks.onState?.("confirming");
    const receipt = await hooks.waitForReceipt(hash);
    if (receipt.status !== "success") throw new Error("TRANSACTION_FAILED");
    hooks.onState?.("confirmed");
    return { approvalTxHash, txHash: hash, status: "confirmed" };
  } catch (error) {
    if (rejection(error)) throw new Error("USER_REJECTED");
    throw error;
  }
}

export interface SolanaWalletExecutor {
  publicKey: string;
  signAndSendTransaction(serializedTransaction: string): Promise<string>;
  confirmTransaction(signature: string): Promise<"confirmed" | "failed">;
}

export async function executeSolanaTransaction(wallet: SolanaWalletExecutor, serializedTransaction: string) {
  if (!serializedTransaction) throw new Error("MISSING_SOLANA_TRANSACTION");
  const signature = await wallet.signAndSendTransaction(serializedTransaction);
  if (!signature) throw new Error("SOLANA_BROADCAST_FAILED");
  if (await wallet.confirmTransaction(signature) !== "confirmed") throw new Error("SOLANA_TRANSACTION_FAILED");
  return { txHash: signature, status: "confirmed" as const };
}
