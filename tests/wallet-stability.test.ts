import { describe, expect, it, vi } from "vitest";
import {
  chainFromNetwork,
  validWalletAddress,
  WalletOperationGate,
  walletConnectionPhase,
  walletErrorMessage,
  walletMatchesTokenChain,
  withWalletTimeout,
} from "@/lib/wallet/state";

describe("wallet connection stability and multichain safety", () => {
  it("treats a valid connected account as connected even when metadata or balance still load", () => {
    expect(walletConnectionPhase({ namespace: "eip155", address: "0x1111111111111111111111111111111111111111", accountStatus: "reconnecting", operation: "connect" })).toBe("connected");
  });

  it("represents stale restore, duplicate operations and cancellation without allowing old responses", () => {
    expect(walletConnectionPhase({ namespace: "eip155", accountStatus: "reconnecting" })).toBe("restoring");
    expect(walletConnectionPhase({ namespace: "eip155", accountStatus: "reconnecting", restoreTimedOut: true })).toBe("error");
    const gate = new WalletOperationGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.cancel();
    expect(gate.isCurrent(second)).toBe(false);
  });

  it("classifies rejected, locked, expired, timeout and interrupted network states", () => {
    expect(walletErrorMessage(Object.assign(new Error("rejected"), { code: 4001 }))).toContain("拒绝");
    expect(walletErrorMessage(new Error("wallet locked"))).toContain("锁定");
    expect(walletErrorMessage(new Error("qr expired"))).toContain("过期");
    expect(walletErrorMessage(new Error("timeout"))).toContain("超时");
    expect(walletErrorMessage(new Error("relay network offline"))).toContain("网络");
  });

  it("keeps EVM and Solana namespaces independent", () => {
    expect(validWalletAddress("eip155", "0x1111111111111111111111111111111111111111")).toBe(true);
    expect(validWalletAddress("solana", "11111111111111111111111111111111")).toBe(true);
    expect(validWalletAddress("solana", "0x1111111111111111111111111111111111111111")).toBe(false);
  });

  it("maps BSC to Solana, Solana to Base and Base to Robinhood without chain leakage", () => {
    expect(chainFromNetwork(56)).toBe("bsc");
    expect(chainFromNetwork(null, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe("sol");
    expect(chainFromNetwork(8453)).toBe("base");
    expect(chainFromNetwork(null, "eip155:4663")).toBe("robinhood");
    expect(walletMatchesTokenChain("bsc", "sol")).toBe(false);
    expect(walletMatchesTokenChain("base", "base")).toBe(true);
  });

  it("times out a wallet request instead of spinning forever", async () => {
    vi.useFakeTimers();
    const request = withWalletTimeout(new Promise<void>(() => {}), 15);
    const expectation = expect(request).rejects.toThrow("WALLET_TIMEOUT");
    await vi.advanceTimersByTimeAsync(15);
    await expectation;
    vi.useRealTimers();
  });
});
