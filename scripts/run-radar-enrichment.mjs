const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const secret = String(process.env.MONITOR_SECRET || "");
if (!site || !secret) throw new Error("radar enrichment runner is not configured");

const response = await fetch(`${site}/api/radar/enrich`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 5 }),
  signal: AbortSignal.timeout(55_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`radar enrichment returned HTTP ${response.status}`);
console.log(JSON.stringify({ ok: true, processed: Number(payload.processed || 0), statuses: Array.isArray(payload.results) ? payload.results.map((row) => String(row.status || "UNKNOWN")) : [] }));
