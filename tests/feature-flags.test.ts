import { describe, expect, it } from "vitest";
import { tradingFeatureFlags } from "@/lib/feature-flags";

describe("trading feature flags", () => {
  it("fails closed when configuration is absent or malformed", () => {
    expect(tradingFeatureFlags({})).toEqual({ walletConnect: false, liveMarket: false, tradeQuote: false, tradeTestnet: false, tradeMainnet: false, tradeMainnetChains: { sol: false, bsc: false, base: false, robinhood: false } });
    expect(tradingFeatureFlags({ FEATURE_TRADE_MAINNET: "1", FEATURE_WALLET_CONNECT: "yes" }).tradeMainnet).toBe(false);
  });
  it("enables only explicit true values", () => {
    const flags = tradingFeatureFlags({ FEATURE_WALLET_CONNECT: " TRUE ", FEATURE_TRADE_MAINNET: "false", FEATURE_TRADE_MAINNET_BASE: "true" });
    expect(flags.walletConnect).toBe(true);
    expect(flags.tradeMainnet).toBe(false);
    expect(flags.tradeMainnetChains.base).toBe(true);
  });
});
