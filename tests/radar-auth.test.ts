import { describe, expect, it } from "vitest";
import { consumeWalletNonce, hashNonce, walletLoginMessage, type WalletNonce } from "@/lib/radar/auth";

const record: WalletNonce = { nonceHash: "hash", namespace: "eip155", chain: "56", walletAddress: "0xabc", expiresAt: "2026-09-21T10:10:00.000Z", consumedAt: null };
describe("wallet-login replay boundary", () => {
  it("binds a nonce to namespace, chain and address and consumes it once", () => {
    const consumed = consumeWalletNonce(record, { namespace: "eip155", chain: "56", walletAddress: "0xabc" }, Date.parse("2026-09-21T10:00:00Z"));
    expect(consumed.consumedAt).toBeTruthy();
    expect(() => consumeWalletNonce(consumed, record, Date.parse("2026-09-21T10:01:00Z"))).toThrow("NONCE_ALREADY_USED");
    expect(() => consumeWalletNonce(record, { namespace: "solana", chain: "sol", walletAddress: "abc" }, Date.parse("2026-09-21T10:00:00Z"))).toThrow("NONCE_SCOPE_MISMATCH");
  });
  it("rejects expiry and creates a non-transaction signing message", async () => {
    expect(() => consumeWalletNonce(record, record, Date.parse("2026-09-21T10:10:00Z"))).toThrow("NONCE_EXPIRED");
    expect(walletLoginMessage({ domain: "example.test", namespace: "eip155", chain: "56", address: "0xabc", nonce: "nonce", issuedAt: "now", expiresAt: "later" })).toContain("不授权任何交易");
    expect(await hashNonce("nonce")).toHaveLength(64);
  });
});
