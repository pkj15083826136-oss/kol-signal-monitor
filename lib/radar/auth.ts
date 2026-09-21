export type WalletNonce = { nonceHash: string; namespace: "eip155" | "solana"; chain: string; walletAddress: string; expiresAt: string; consumedAt: string | null };

export function walletLoginMessage(input: { domain: string; namespace: "eip155" | "solana"; chain: string; address: string; nonce: string; issuedAt: string; expiresAt: string }) {
  return `${input.domain} 请求验证钱包登录\n地址: ${input.address}\n网络: ${input.namespace}:${input.chain}\nNonce: ${input.nonce}\n签发时间: ${input.issuedAt}\n过期时间: ${input.expiresAt}\n本签名不授权任何交易。`;
}

export async function hashNonce(nonce: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function consumeWalletNonce(record: WalletNonce, expected: Pick<WalletNonce, "namespace" | "chain" | "walletAddress">, now = Date.now()) {
  if (record.consumedAt) throw new Error("NONCE_ALREADY_USED");
  if (Date.parse(record.expiresAt) <= now) throw new Error("NONCE_EXPIRED");
  if (record.namespace !== expected.namespace || record.chain !== expected.chain || record.walletAddress !== expected.walletAddress) throw new Error("NONCE_SCOPE_MISMATCH");
  return { ...record, consumedAt: new Date(now).toISOString() };
}
