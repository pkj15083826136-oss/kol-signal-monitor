import WebSocket from "ws";

const enabled = String(process.env.BITQUERY_ENABLED || "").toLowerCase() === "true";
const licenseApproved = String(process.env.BITQUERY_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
if (!enabled) {
  console.log("Bitquery adapter is disabled; no data was requested or published.");
  process.exit(0);
}
if (!licenseApproved) throw new Error("BITQUERY_PUBLIC_DISTRIBUTION_APPROVED must be true before collection");
const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const secret = process.env.MONITOR_SECRET || "";
const token = process.env.BITQUERY_ACCESS_TOKEN || "";
if (!site || !secret || !token) throw new Error("SITE_URL, MONITOR_SECRET and BITQUERY_ACCESS_TOKEN are required when enabled");

const httpEndpoint = process.env.BITQUERY_HTTP_ENDPOINT || "https://asia.streaming.bitquery.io/graphql";
const wsEndpoint = httpEndpoint.replace(/^http/, "ws");
const deadline = Date.now() + Number(process.env.COLLECTOR_DURATION_MS || 2_700_000);
const evmChains = [
  ["ethereum", "eth"], ["bsc", "bsc"], ["base", "base"], ["arbitrum", "arbitrum"],
  ["optimism", "optimism"], ["polygon", "matic"], ["robinhood", "robinhood"], ["arc", "arc"],
];
const chains = [...evmChains.map(([chain]) => chain), "tron", "solana"];
const coverage = chains.map((chain) => ({ chain, stream: "Transfers", minimumUsd: 10_000_000, labels: "Bitquery Metadata.Labels", replay: "HTTP realtime-window catch-up" }));
const cursors = {};
const queue = [];
const labelCache = new Map();
let flushTail = Promise.resolve();

async function siteRequest(path, init = {}) {
  const response = await fetch(`${site}${path}`, { ...init, headers: { authorization: `Bearer ${secret}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`site HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

function transferSelection(root, chain) {
  const transaction = chain === "solana" ? "Transaction { Signature }" : "Transaction { Hash }";
  const currency = chain === "solana" ? "Currency { Symbol MintAddress }" : "Currency { Symbol SmartContract }";
  const parties = chain === "solana" ? "Sender { Address } Receiver { Address }" : "Sender Receiver";
  return `${root} { Transfers(where: {Transfer: {AmountInUSD: {ge: \"10000000\"}}}) { Block { Time } ${transaction} Transfer { Id Amount AmountInUSD ${parties} ${currency} } } }`;
}

function subscriptionFor(chain) {
  if (chain === "solana") return `subscription { ${transferSelection("Solana(network: solana)", chain)} }`;
  if (chain === "tron") return `subscription { ${transferSelection("Tron", chain)} }`;
  const network = evmChains.find(([name]) => name === chain)?.[1];
  return `subscription { ${transferSelection(`EVM(network: ${network})`, chain)} }`;
}

function backfillFor(chain, since) {
  const where = `where: {Transfer: {AmountInUSD: {ge: \"10000000\"}}, Block: {Time: {since: \"${since}\"}}}, limit: {count: 5000}, orderBy: {ascending: Block_Time}`;
  const transaction = chain === "solana" ? "Transaction { Signature }" : "Transaction { Hash }";
  const currency = chain === "solana" ? "Currency { Symbol MintAddress }" : "Currency { Symbol SmartContract }";
  const parties = chain === "solana" ? "Sender { Address } Receiver { Address }" : "Sender Receiver";
  const selection = `Transfers(${where}) { Block { Time } ${transaction} Transfer { Id Amount AmountInUSD ${parties} ${currency} } }`;
  if (chain === "solana") return `query { Solana(network: solana, dataset: realtime) { ${selection} } }`;
  if (chain === "tron") return `query { Tron(dataset: realtime) { ${selection} } }`;
  const network = evmChains.find(([name]) => name === chain)?.[1];
  return `query { EVM(network: ${network}, dataset: realtime) { ${selection} } }`;
}

async function bitquery(query) {
  const response = await fetch(httpEndpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) throw new Error(`Bitquery GraphQL error: ${JSON.stringify(payload.errors || response.status).slice(0, 400)}`);
  return payload;
}

function rootRows(payload) {
  const data = payload?.data || {};
  return data.EVM?.Transfers || data.Tron?.Transfers || data.Solana?.Transfers || [];
}

function addressesFrom(events) {
  const values = new Set();
  for (const event of events) for (const row of rootRows(event)) {
    const sender = typeof row?.Transfer?.Sender === "object" ? row.Transfer.Sender.Address : row?.Transfer?.Sender;
    const receiver = typeof row?.Transfer?.Receiver === "object" ? row.Transfer.Receiver.Address : row?.Transfer?.Receiver;
    if (sender) values.add(String(sender)); if (receiver) values.add(String(receiver));
  }
  return [...values];
}

async function resolveLabels(addresses) {
  const now = Date.now();
  const missing = addresses.filter((address) => !labelCache.has(address.toLowerCase()) || labelCache.get(address.toLowerCase()).expiresAt < now);
  for (let offset = 0; offset < missing.length; offset += 100) {
    const batch = missing.slice(offset, offset + 100);
    const query = `query { Metadata { Labels(where: {Address: {in: ${JSON.stringify(batch)}}}, limitBy: {by: [Address, Chain, Label_Type], count: 1}, orderBy: {descending: RecordedAt}) { Address Chain Label { Type Value } RecordedAt } } }`;
    const payload = await bitquery(query);
    const grouped = new Map(batch.map((address) => [address.toLowerCase(), []]));
    for (const row of payload?.data?.Metadata?.Labels || []) grouped.get(String(row.Address).toLowerCase())?.push({ address: String(row.Address), chain: String(row.Chain || ""), type: String(row.Label?.Type || ""), value: String(row.Label?.Value || ""), recordedAt: row.RecordedAt || null });
    for (const address of batch) labelCache.set(address.toLowerCase(), { labels: grouped.get(address.toLowerCase()) || [], expiresAt: now + 86_400_000 });
  }
  return addresses.flatMap((address) => labelCache.get(address.toLowerCase())?.labels || []);
}

function updateCursor(chain, payload) {
  const times = rootRows(payload).map((row) => Date.parse(String(row?.Block?.Time || ""))).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function flushOnce() {
  if (!queue.length) return;
  const events = queue.slice(0, 500);
  const labels = await resolveLabels(addressesFrom(events));
  const nextCursors = { ...cursors };
  for (const event of events) {
    const next = updateCursor(event.chain, event);
    if (next && (!nextCursors[event.chain] || Date.parse(next) > Date.parse(nextCursors[event.chain]))) nextCursors[event.chain] = next;
  }
  await siteRequest("/api/fund-flows/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "bitquery", status: "healthy", connectionStatus: "connected", cursor: JSON.stringify(nextCursors), coverage, labels, events }) });
  queue.splice(0, events.length);
  Object.assign(cursors, nextCursors);
}

function flush() {
  const pending = flushTail.then(flushOnce);
  flushTail = pending.catch(() => {});
  return pending;
}

async function backfill(chain) {
  const since = cursors[chain];
  if (!since) return;
  const payload = await bitquery(backfillFor(chain, new Date(Date.parse(since) - 5_000).toISOString()));
  const rows = rootRows(payload);
  if (rows.length >= 5000) throw new Error(`${chain}_backfill_window_exceeded_5000_rows`);
  if (rows.length) { queue.push({ chain, ...payload }); await flush(); }
}

async function runChain(chain) {
  let retryMs = 1_000;
  while (Date.now() < deadline) {
    try {
      await backfill(chain);
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsEndpoint, "graphql-transport-ws", { headers: { authorization: `Bearer ${token}` }, handshakeTimeout: 10_000 });
        let acknowledged = false; let lastPong = Date.now();
        let sessionError = null;
        const timer = setInterval(() => { if (Date.now() - lastPong > 90_000) return ws.terminate(); ws.ping(); }, 30_000);
        const closeTimer = setTimeout(() => ws.close(), Math.min(300_000, Math.max(1_000, deadline - Date.now())));
        const fail = (error) => { sessionError ||= error instanceof Error ? error : new Error(String(error)); ws.terminate(); };
        ws.on("pong", () => { lastPong = Date.now(); });
        ws.on("open", () => ws.send(JSON.stringify({ type: "connection_init" })));
        ws.on("message", (raw) => {
          let message; try { message = JSON.parse(raw.toString()); } catch { return; }
          if (message.type === "connection_ack") { acknowledged = true; retryMs = 1_000; ws.send(JSON.stringify({ id: chain, type: "subscribe", payload: { query: subscriptionFor(chain) } })); return; }
          if (message.type === "next" && message.payload?.data) { const event = { chain, ...message.payload }; queue.push(event); if (queue.length >= 50) void flush().catch(fail); }
          if (message.type === "error") fail(new Error(`${chain} stream error: ${JSON.stringify(message.payload).slice(0, 300)}`));
        });
        ws.on("error", fail);
        ws.on("close", () => { clearInterval(timer); clearTimeout(closeTimer); if (sessionError) reject(sessionError); else if (acknowledged) resolve(); else reject(new Error(`${chain} closed before connection_ack`)); });
      });
    } catch (error) {
      await siteRequest("/api/fund-flows/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "bitquery", status: "degraded", connectionStatus: "reconnecting", cursor: JSON.stringify(cursors), coverage, error: error instanceof Error ? error.message : String(error), events: [] }) }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, retryMs + Math.random() * 250));
      retryMs = Math.min(retryMs * 2, 30_000);
    }
  }
}

try {
  const previous = await siteRequest("/api/fund-flows/collect?provider=bitquery");
  if (previous?.state?.cursor) Object.assign(cursors, JSON.parse(String(previous.state.cursor)));
} catch {}
const flushTimer = setInterval(() => void flush().catch(console.error), 5_000);
await Promise.all(chains.map(runChain));
clearInterval(flushTimer);
await flush();
