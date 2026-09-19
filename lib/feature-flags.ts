export type TradingFeatureFlags = {
  walletConnect: boolean;
  liveMarket: boolean;
  tradeQuote: boolean;
  tradeTestnet: boolean;
  tradeMainnet: boolean;
};

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function tradingFeatureFlags(source: Record<string, string | undefined>): TradingFeatureFlags {
  return {
    walletConnect: enabled(source.FEATURE_WALLET_CONNECT),
    liveMarket: enabled(source.FEATURE_LIVE_MARKET),
    tradeQuote: enabled(source.FEATURE_TRADE_QUOTE),
    tradeTestnet: enabled(source.FEATURE_TRADE_TESTNET),
    tradeMainnet: enabled(source.FEATURE_TRADE_MAINNET),
  };
}
