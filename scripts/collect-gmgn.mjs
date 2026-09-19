const chains = ["sol", "bsc", "base", "robinhood"];
if (!process.env.MONITOR_SECRET) throw new Error("MONITOR_SECRET is required");
const requestedChain = process.env.MONITOR_CHAIN;
const chain = chains.includes(requestedChain) ? requestedChain : chains[Math.floor(Date.now() / 60000) % chains.length];

async function gmgn(kind) {
  const startedAt = Date.now();
  const query = new URLSearchParams({
    chain,
    limit: "200",
    timestamp: String(Math.floor(Date.now() / 1000)),
    client_id: crypto.randomUUID(),
  });
  const response = await fetch(`https://openapi.gmgn.ai/v1/user/${kind}?${query}`, {
    headers: { "X-APIKEY": process.env.GMGN_API_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) throw new Error(`${kind}: ${payload.message || response.status}`);
  return { data: payload.data, latencyMs: Date.now() - startedAt };
}

const kolResult = await gmgn("kol");
await new Promise((resolve) => setTimeout(resolve, 2000));
const smartmoneyResult = await gmgn("smartmoney");
const response = await fetch(`${process.env.SITE_URL.replace(/\/$/, "")}/api/monitor/run?chain=${chain}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.MONITOR_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ feeds: {
    kol: kolResult.data,
    smartmoney: smartmoneyResult.data,
    health: { kol: { latencyMs: kolResult.latencyMs }, smartmoney: { latencyMs: smartmoneyResult.latencyMs } },
  } }),
  signal: AbortSignal.timeout(70000),
});
const text = await response.text();
console.log(text);
if (!response.ok) throw new Error(`site HTTP ${response.status}`);
