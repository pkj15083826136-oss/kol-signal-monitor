import { describe, expect, it, vi } from "vitest";
import { ReadonlyWalletSession, type ReadonlyWalletProvider } from "@/lib/wallet/session";

function provider(overrides: Partial<ReadonlyWalletProvider> = {}): ReadonlyWalletProvider {
  return {
    connect: vi.fn(async () => ({ address: "0x1234", chain: "base" as const })),
    switchChain: vi.fn(async () => undefined),
    balance: vi.fn(async () => "1.25 ETH"),
    disconnect: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("readonly wallet session", () => {
  it("connects, reads balance, switches chain and disconnects without signing", async () => {
    const session = new ReadonlyWalletSession(provider());
    expect(await session.connect()).toMatchObject({ status: "connected", address: "0x1234", balance: "1.25 ETH" });
    expect(await session.switchChain("bsc")).toMatchObject({ status: "connected", chain: "bsc" });
    expect(await session.disconnect()).toMatchObject({ status: "idle", address: null });
  });
  it("surfaces wallet rejection", async () => {
    const session = new ReadonlyWalletSession(provider({ connect: vi.fn(async () => { throw new Error("用户拒绝连接"); }) }));
    expect(await session.connect()).toMatchObject({ status: "error", error: "用户拒绝连接" });
  });
  it("retains the previous chain when switching fails", async () => {
    const session = new ReadonlyWalletSession(provider({ switchChain: vi.fn(async () => { throw new Error("钱包拒绝切链"); }) }));
    await session.connect();
    expect(await session.switchChain("robinhood")).toMatchObject({ status: "error", chain: "base", error: "钱包拒绝切链" });
  });
});
