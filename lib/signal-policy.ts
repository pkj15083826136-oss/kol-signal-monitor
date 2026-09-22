const MATURE_BASE_SYMBOLS = new Set([
  "BTC", "WBTC", "ETH", "WETH", "SOL", "WSOL", "BNB", "WBNB",
  "USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "PYUSD",
]);

export const FIRST_SIGNAL_MAX_MARKET_CAP = 20_000_000;
export const FIRST_SIGNAL_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const CONFIRMED_MATURE_ASSETS = new Set([
  "sol:98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
]);

export function isMatureBaseAsset(symbol: string) {
  return MATURE_BASE_SYMBOLS.has(symbol.trim().toUpperCase());
}

export type FirstSignalDecision = { status: "allow" | "suppressed" | "data_review"; reason: string };

export function assessFirstSignal(input: { symbol: string; chain?: string; address?: string; marketCap: number | null; createdAt: number | null; identityVerified?: boolean; marketDataConflict?: boolean; now?: number; maxMarketCap?: number }): FirstSignalDecision {
  const assetKey = `${input.chain || ""}:${input.chain === "sol" ? (input.address || "") : (input.address || "").toLowerCase()}`;
  if (isMatureBaseAsset(input.symbol) || CONFIRMED_MATURE_ASSETS.has(assetKey)) return { status: "suppressed", reason: "confirmed_mature_asset" };
  if (input.marketDataConflict) return { status: "data_review", reason: "market_data_conflict" };
  if (input.identityVerified === false) return { status: "data_review", reason: "token_identity_unverified" };
  if (input.marketCap === null || input.marketCap <= 0) return { status: "data_review", reason: "market_cap_unknown" };
  if (input.marketCap >= (input.maxMarketCap ?? FIRST_SIGNAL_MAX_MARKET_CAP)) return { status: "suppressed", reason: "market_cap_limit" };
  if (input.createdAt === null || input.createdAt <= 0) return { status: "data_review", reason: "creation_time_unknown" };
  return { status: "allow", reason: "eligible" };
}

export function rejectFirstSignal(input: { symbol: string; chain?: string; address?: string; marketCap: number | null; createdAt: number | null; identityVerified?: boolean; marketDataConflict?: boolean; now?: number; maxMarketCap?: number }) {
  return assessFirstSignal(input).status !== "allow";
}
