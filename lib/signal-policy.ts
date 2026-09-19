const MATURE_BASE_SYMBOLS = new Set([
  "BTC", "WBTC", "ETH", "WETH", "SOL", "WSOL", "BNB", "WBNB",
  "USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "PYUSD",
]);

export const FIRST_SIGNAL_MAX_MARKET_CAP = 20_000_000;
export const FIRST_SIGNAL_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

export function isMatureBaseAsset(symbol: string) {
  return MATURE_BASE_SYMBOLS.has(symbol.trim().toUpperCase());
}

export function rejectFirstSignal(input: { symbol: string; marketCap: number; createdAt: number; now?: number }) {
  if (isMatureBaseAsset(input.symbol)) return true;
  if (input.marketCap <= FIRST_SIGNAL_MAX_MARKET_CAP) return false;
  // This is an early, lower-cap discovery monitor. When a token is already
  // above $20M and its birth time cannot be verified, suppress it instead of
  // letting mature assets through because of missing third-party metadata.
  if (!input.createdAt) return true;
  return (input.now ?? Date.now()) - input.createdAt > FIRST_SIGNAL_MAX_AGE_MS;
}
