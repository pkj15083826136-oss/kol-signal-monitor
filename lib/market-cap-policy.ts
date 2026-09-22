export const DEFAULT_KOL_ALERT_MAX_MARKET_CAP = 20_000_000;

export function parseMarketCapLimit(input: unknown, fallback = DEFAULT_KOL_ALERT_MAX_MARKET_CAP) {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? Math.floor(input) : fallback;
  const text = String(input ?? "").trim().toUpperCase().replace(/[,$\s]/g, "");
  const match = /^(\d+(?:\.\d+)?)([MB])?$/.exec(text);
  if (!match) return fallback;
  const multiple = match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : 1;
  const value = Number(match[1]) * multiple;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function shouldSuppressByMarketCap(marketCap: number | null | undefined, limit = DEFAULT_KOL_ALERT_MAX_MARKET_CAP) {
  if (marketCap === null || marketCap === undefined || !Number.isFinite(marketCap) || marketCap <= 0) return { suppress: false, review: true };
  return { suppress: marketCap >= limit, review: false };
}

export function trustedMarketCap(next: number | null | undefined, lastKnownGood: number | null | undefined) {
  if (!Number.isFinite(next) || Number(next) <= 0) return lastKnownGood ?? null;
  if (Number.isFinite(lastKnownGood) && Number(lastKnownGood) > 0 && (Number(next) > Number(lastKnownGood) * 5 || Number(next) < Number(lastKnownGood) / 5)) return Number(lastKnownGood);
  return Number(next);
}
