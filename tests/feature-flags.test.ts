import { describe, expect, it } from "vitest";
import { tradingFeatureFlags } from "@/lib/feature-flags";

describe("trading feature flags", () => {
  it("fails closed when configuration is absent or malformed", () => {
    expect(tradingFeatureFlags({})).toEqual({ walletConnect: false, liveMarket: false, tradeQuote: false, tradeTestnet: false, tradeMainnet: false });
    expect(tradingFeatureFlags({ FEATURE_TRADE_MAINNET: "1", FEATURE_WALLET_CONNECT: "yes" }).tradeMainnet).toBe(false);
  });
  it("enables only explicit true values", () => {
    const flags = tradingFeatureFlags({ FEATURE_WALLET_CONNECT: " TRUE ", FEATURE_TRADE_MAINNET: "false" });
    expect(flags.walletConnect).toBe(true);
    expect(flags.tradeMainnet).toBe(false);
  });
});
