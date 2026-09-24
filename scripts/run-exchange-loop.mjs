import { fetchBinanceSpotPairs } from "./binance-spot-snapshot.mjs";

const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const secret = process.env.MONITOR_SECRET || "";
const duration = Number(process.env.COLLECTOR_DURATION_MS || 3_300_000);
const interval = Number(process.env.COLLECTOR_INTERVAL_MS || 60_000);
if (!site || !secret) throw new Error("SITE_URL or MONITOR_SECRET missing");
if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(interval) || interval <= 0) {
  throw new Error("COLLECTOR_DURATION_MS and COLLECTOR_INTERVAL_MS must be positive numbers");
}

const deadline = Date.now() + duration;
let scheduledAt = Date.now();
let attempt = 0;
while (Date.now() < deadline) {
  attempt++;
  const startedAt = Date.now();
  try {
    const binanceSpotPairs = await fetchBinanceSpotPairs();
    const response = await fetch(`${site}/api/exchange-events/collect`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ binanceSpotPairs }),
      signal: AbortSignal.timeout(180_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    console.log(JSON.stringify({ attempt, scheduledAt: new Date(scheduledAt).toISOString(), startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(), result: JSON.parse(text) }));
  } catch (error) {
    console.error(JSON.stringify({ attempt, scheduledAt: new Date(scheduledAt).toISOString(), startedAt: new Date(startedAt).toISOString(), failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
  }
  scheduledAt += interval;
  const now = Date.now();
  if (scheduledAt <= now) {
    const skipped = Math.floor((now - scheduledAt) / interval) + 1;
    scheduledAt += skipped * interval;
    console.warn(JSON.stringify({ type: "schedule_lag", skipped, nextScheduledAt: new Date(scheduledAt).toISOString() }));
  }
  if (scheduledAt >= deadline) break;
  await new Promise((resolve) => setTimeout(resolve, scheduledAt - Date.now()));
}
