import { fetchBinanceSpotPairs } from "./binance-spot-snapshot.mjs";

const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const secret = process.env.MONITOR_SECRET || "";
if (!site || !secret) throw new Error("SITE_URL or MONITOR_SECRET missing");
const binanceSpotPairs = await fetchBinanceSpotPairs();
const response = await fetch(`${site}/api/exchange-events/collect`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ binanceSpotPairs }), signal: AbortSignal.timeout(120_000) });
const text = await response.text();
if (!response.ok) throw new Error(`exchange collector HTTP ${response.status}: ${text.slice(0, 300)}`);
console.log(text);
