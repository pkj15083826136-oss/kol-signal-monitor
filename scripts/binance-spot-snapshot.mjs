const endpoint = "https://data-api.binance.vision/api/v3/exchangeInfo?showPermissionSets=false";

export async function fetchBinanceSpotPairs() {
  const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`Binance spot snapshot HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];
  const pairs = [...new Set(rows.flatMap((row) => {
    const status = String(row?.status || "").toUpperCase();
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    return symbol && !["OFFLINE", "CANCEL_ONLY", "SELL_ONLY", "DELISTED"].includes(status) ? [symbol] : [];
  }))].sort();
  if (pairs.length < 100) throw new Error(`Binance spot snapshot unexpectedly small: ${pairs.length}`);
  return pairs;
}
