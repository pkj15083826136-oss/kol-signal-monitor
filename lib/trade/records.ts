import type { QuoteChain } from "@/lib/trade/quote";

export type UserTradeRecord = { chain: QuoteChain; network: "testnet" | "mainnet"; txHash: string; walletAddress: string; sellToken: string; buyToken: string; sellAmount: string; minimumOut: string; status: "pending" | "confirmed" | "failed"; approvalTxHash?: string | null; errorCode?: string | null; createdAt: string; confirmedAt?: string | null };
const digits = /^\d+$/;
const forbiddenKeys = new Set(["privateKey", "private_key", "mnemonic", "seed", "signature", "signedTransaction"]);
export function validateTradeRecordInput(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["记录格式无效"];
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  if (Object.keys(input).some((key) => forbiddenKeys.has(key))) errors.push("请求不得包含密钥、助记词或签名材料");
  if (!(["sol", "bsc", "base", "robinhood"] as unknown[]).includes(input.chain)) errors.push("链无效");
  if (!(["testnet", "mainnet"] as unknown[]).includes(input.network)) errors.push("网络无效");
  if (!(["pending", "confirmed", "failed"] as unknown[]).includes(input.status)) errors.push("状态无效");
  if (typeof input.sellAmount !== "string" || !digits.test(input.sellAmount) || typeof input.minimumOut !== "string" || !digits.test(input.minimumOut)) errors.push("金额必须使用最小单位整数字符串");
  for (const field of ["txHash", "walletAddress", "sellToken", "buyToken", "createdAt"]) if (typeof input[field] !== "string" || !input[field]) errors.push(`${field} 无效`);
  return errors;
}
export function normalizeTradeRecord(value: UserTradeRecord): UserTradeRecord {
  if (!digits.test(value.sellAmount) || !digits.test(value.minimumOut)) throw new Error("INVALID_TRADE_AMOUNT");
  if (!value.txHash.trim() || !value.walletAddress.trim()) throw new Error("INVALID_TRADE_IDENTITY");
  const evm = value.chain !== "sol";
  return { ...value, txHash: evm ? value.txHash.toLowerCase() : value.txHash, walletAddress: evm ? value.walletAddress.toLowerCase() : value.walletAddress, sellToken: evm ? value.sellToken.toLowerCase() : value.sellToken, buyToken: evm ? value.buyToken.toLowerCase() : value.buyToken, approvalTxHash: value.approvalTxHash ? (evm ? value.approvalTxHash.toLowerCase() : value.approvalTxHash) : null, errorCode: value.errorCode || null, confirmedAt: value.confirmedAt || null };
}
