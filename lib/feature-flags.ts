export type TradingFeatureFlags = {
  walletConnect: boolean;
  liveMarket: boolean;
  tradeQuote: boolean;
  tradeTestnet: boolean;
  tradeMainnet: boolean;
  tradeMainnetChains: Record<"sol" | "bsc" | "base" | "robinhood", boolean>;
  radarWalletLogin: boolean;
  radarAutoTrade: boolean;
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
    tradeMainnetChains: {
      sol: enabled(source.FEATURE_TRADE_MAINNET_SOL),
      bsc: enabled(source.FEATURE_TRADE_MAINNET_BSC),
      base: enabled(source.FEATURE_TRADE_MAINNET_BASE),
      robinhood: enabled(source.FEATURE_TRADE_MAINNET_ROBINHOOD),
    },
    radarWalletLogin: enabled(source.FEATURE_RADAR_WALLET_LOGIN),
    radarAutoTrade: enabled(source.FEATURE_RADAR_AUTOTRADE),
  };
}
