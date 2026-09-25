const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const MONITOR_SECRET = process.env.MONITOR_SECRET || "";
const RPC_URL = process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";
const RUN_MS = Number(process.env.COLLECTOR_DURATION_MS || 0);
const POLL_MS = Math.max(15_000, Number(process.env.PUBLIC_FLOW_POLL_MS || 60_000));
const INITIAL_BACKFILL = Math.max(100, Number(process.env.PUBLIC_FLOW_INITIAL_BACKFILL_BLOCKS || 7_200));
const CONFIRMATIONS = Math.max(1, Number(process.env.PUBLIC_FLOW_CONFIRMATIONS || 12));
const CHUNK_SIZE = Math.min(500, Math.max(50, Number(process.env.PUBLIC_FLOW_BLOCK_CHUNK || 500)));
const POR_API = "https://www.binance.com/bapi/apex/v1/public/apex/market/por/address";
const POR_PAGE = "https://www.binance.com/en/proof-of-reserves";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKENS = [
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value) => `0x${value.toString(16)}`;
const addressFromTopic = (value) => `0x${String(value || "").slice(-40)}`.toLowerCase();

async function retry(label, fn, attempts = 4) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await fn(); } catch (error) {
      last = error;
      if (attempt + 1 < attempts) await sleep(Math.min(15_000, 1_000 * 2 ** attempt));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function rpc(method, params) {
  const body = await retry(`RPC ${method}`, () => jsonRequest(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  if (body.error) throw new Error(`${body.error.code || "RPC"} ${body.error.message || "unknown error"}`);
  return body.result;
}

async function site(path, options = {}) {
  if (!MONITOR_SECRET) throw new Error("MONITOR_SECRET is required for collector ingestion");
  return retry(`Site ${path}`, () => jsonRequest(`${SITE_URL}${path}`, { ...options, headers: { authorization: `Bearer ${MONITOR_SECRET}`, ...(options.headers || {}) } }));
}

async function officialAddresses() {
  const body = await retry("Binance Proof of Reserves", () => jsonRequest(POR_API, { headers: { "user-agent": "kol-signal-monitor/1.0" } }));
  if (body.code !== "000000" || !Array.isArray(body.data)) throw new Error("unexpected Binance PoR response");
  const all = body.data.filter((row) => row.network === "ETH" && /^0x[0-9a-f]{40}$/i.test(row.address));
  const direct = [...new Set(all.filter((row) => !row.thirdPartyCustodianName).map((row) => row.address.toLowerCase()))];
  if (direct.length < 5) throw new Error(`partial Binance PoR response: only ${direct.length} direct ETH addresses`);
  return direct;
}

function coverage(addresses) {
  return [{
    mode: "limited_known_address_sample", chain: "ethereum", assets: TOKENS.map((token) => token.symbol), exchange: "Binance",
    addressCount: addresses.length, addressScope: "Binance Proof of Reserves 中披露且未标为第三方托管方的 ETH 地址",
    attributionSource: POR_PAGE, rpcProvider: RPC_URL, rpcSla: "none", pricing: "keyless public endpoint; published fixed quota unavailable",
    valuation: "USDT/USDC 按 1 美元名义值筛选；未校正脱锚", omissions: ["未披露充值地址", "其他交易所", "其他链", "其他资产", "合约路由与链下内部账务"],
  }];
}

async function postHealth(status, addresses, cursor, error = null, events = []) {
  return site("/api/fund-flows/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "public_rpc", status, connectionStatus: status === "healthy" ? "connected" : "reconnecting", cursor: cursor == null ? null : String(cursor), coverage: coverage(addresses), error, events }) });
}

async function getState() {
  const response = await site("/api/fund-flows/collect?provider=public_rpc");
  const value = Number(response.state?.cursor);
  let previousAddressCount = 0;
  try { previousAddressCount = Number(JSON.parse(response.state?.coverage_json || "[]")?.[0]?.addressCount || 0); } catch { previousAddressCount = 0; }
  return { cursor: Number.isSafeInteger(value) && value >= 0 ? value : null, previousAddressCount };
}

async function blockTimes(blockNumbers) {
  const result = new Map();
  for (let offset = 0; offset < blockNumbers.length; offset += 10) {
    const batch = blockNumbers.slice(offset, offset + 10).map((block, index) => ({ jsonrpc: "2.0", id: index + 1, method: "eth_getBlockByNumber", params: [block, false] }));
    const response = await retry("RPC block timestamps", () => jsonRequest(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch) }));
    if (!Array.isArray(response) || response.some((row) => row.error || !row.result?.timestamp)) throw new Error("partial block timestamp response");
    for (const row of response) result.set(row.result.number, new Date(Number.parseInt(row.result.timestamp, 16) * 1000).toISOString());
  }
  return result;
}

async function scan(from, to, addresses) {
  const padded = addresses.map((address) => `0x${"0".repeat(24)}${address.slice(2)}`);
  const logs = [];
  for (const token of TOKENS) {
    for (const topics of [[TRANSFER_TOPIC, padded], [TRANSFER_TOPIC, null, padded]]) {
      const rows = await rpc("eth_getLogs", [{ fromBlock: hex(from), toBlock: hex(to), address: token.address, topics }]);
      if (!Array.isArray(rows)) throw new Error("partial eth_getLogs response");
      for (const row of rows) {
        const amount = Number(BigInt(row.data)) / 10 ** token.decimals;
        if (Number.isFinite(amount) && amount >= 10_000_000) logs.push({ row, token, amount });
      }
    }
  }
  const unique = new Map(logs.map((entry) => [`${entry.row.transactionHash}:${entry.row.logIndex}:${entry.token.symbol}`, entry]));
  const times = await blockTimes([...new Set([...unique.values()].map((entry) => entry.row.blockNumber))]);
  return [...unique.values()].map(({ row, token, amount }) => ({
    chain: "ethereum", txHash: row.transactionHash, logIndex: Number.parseInt(row.logIndex, 16), blockNumber: Number.parseInt(row.blockNumber, 16),
    blockTimestamp: times.get(row.blockNumber), symbol: token.symbol, amount,
    fromAddress: addressFromTopic(row.topics[1]), toAddress: addressFromTopic(row.topics[2]), trackedAddresses: addresses,
    sourceUrl: `https://etherscan.io/tx/${row.transactionHash}`, attributionUrl: POR_PAGE,
  }));
}

async function cycle() {
  const addresses = await officialAddresses();
  const state = await getState();
  if (state.previousAddressCount > 0 && addresses.length < Math.ceil(state.previousAddressCount * 0.7)) throw new Error(`partial Binance PoR response: ${addresses.length}/${state.previousAddressCount} addresses`);
  lastAddresses = addresses;
  const latest = Number.parseInt(await rpc("eth_blockNumber", []), 16) - CONFIRMATIONS;
  let cursor = state.cursor;
  if (cursor === null) cursor = Math.max(0, latest - INITIAL_BACKFILL - 1);
  while (cursor < latest) {
    const from = cursor + 1; const to = Math.min(latest, from + CHUNK_SIZE - 1);
    const events = await scan(from, to, addresses);
    const result = await postHealth("healthy", addresses, to, null, events);
    console.log(JSON.stringify({ at: new Date().toISOString(), from, to, addresses: addresses.length, candidates: events.length, inserted: result.inserted, deduped: result.deduped }));
    cursor = to;
  }
  if (cursor >= latest) await postHealth("healthy", addresses, cursor);
}

const started = Date.now();
let lastAddresses = [];
do {
  try { await cycle(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ at: new Date().toISOString(), status: "degraded", error: message }));
    await postHealth("degraded", lastAddresses, null, message).catch(() => {});
  }
  if (RUN_MS <= 0 || Date.now() + POLL_MS >= started + RUN_MS) break;
  await sleep(POLL_MS);
} while (true);
