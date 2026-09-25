import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";

const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const MONITOR_SECRET = process.env.MONITOR_SECRET || "";
const RPC_URL = process.env.ETHEREUM_RPC_URL || "https://gateway.tenderly.co/public/mainnet";
const RUN_MS = Number(process.env.COLLECTOR_DURATION_MS || 0);
const CONTINUOUS = String(process.env.PUBLIC_FLOW_CONTINUOUS || "").toLowerCase() === "true";
const POLL_MS = Math.max(15_000, Number(process.env.PUBLIC_FLOW_POLL_MS || 60_000));
const INITIAL_BACKFILL = Math.max(100, Number(process.env.PUBLIC_FLOW_INITIAL_BACKFILL_BLOCKS || 7_200));
const CONFIRMATIONS = Math.max(1, Number(process.env.PUBLIC_FLOW_CONFIRMATIONS || 12));
const CHUNK_SIZE = Math.min(500, Math.max(25, Number(process.env.PUBLIC_FLOW_BLOCK_CHUNK || 100)));
const ADDRESS_BATCH_SIZE = Math.min(16, Math.max(1, Number(process.env.PUBLIC_FLOW_ADDRESS_BATCH || 8)));
const RPC_BATCH_SIZE = Math.min(5, Math.max(1, Number(process.env.PUBLIC_FLOW_RPC_BATCH_SIZE || 5)));
const MAX_FAILURES = Math.max(1, Number(process.env.PUBLIC_FLOW_MAX_FAILURES || 5));
const POR_API = "https://www.binance.com/bapi/apex/v1/public/apex/market/por/address";
const POR_PAGE = "https://www.binance.com/en/proof-of-reserves";
const BYBIT_POR_PAGE = "https://www.bybit.com/en/help-center/article/How-to-Verify-Bybit-Ownership-of-Wallet-Addresses-and-Their-Balances";
const BYBIT_POR_PDF = "https://www.bybit.com/common-static/cht-static/por/Bybit_PoR_Audit_Dec.pdf";
const OKX_POR_PAGE = "https://www.okx.com/en-us/proof-of-reserves/download";
const OKX_POR_ARCHIVE = "https://static.okx.com/cdn/okx/por/chain/por_csv_2026090800_V1.zip";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKENS = [
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, valuation: "stablecoin", mintTopic: "0xcb8241adb0c3fdb35b70c24ce35c5eb0c17af7431c99f827d44a445ca624176a", mintEvidence: "tether_issue_event", issuerUrl: "https://tether.to/en/transparency/" },
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6, valuation: "stablecoin", mintTopic: "0xab8530f87dc9b59234c4623bf917212bb2536d647574c8e7e5da92c2ede0c9f8", mintEvidence: "circle_mint_event", issuerUrl: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  { symbol: "UNI", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18, valuation: "chainlink", priceFeed: "0x553303d460ee0afb37edff9be42922d8ff63220e", priceSource: "https://data.chain.link/feeds/ethereum/mainnet/uni-usd" },
];
const BYBIT_ETH_ADDRESSES = [
  "0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4", "0x6bd869be16359f9e26f0608a50497f6ef122ee3e", "0x922fa922da1b0b28d0af5aa274d7326eaa108c3d", "0x88a1493366d48225fc3cefbdae9ebb23e323ade3", "0xa7a93fd0a276fc1c0197a5b5623ed117786eed06", "0xbaed383ede0e5d9d72430661f3285daa77e9439f", "0xee5b5b923ffce93a870b3104b7ca09c3db80047a",
];
// Top 20 Ethereum addresses by disclosed ETH balance in OKX's 2026-09-08
// official PoR reserve CSV (snapshot height 25,926,528). This remains a
// bounded subset, not complete OKX wallet coverage.
const OKX_ETH_ADDRESSES = [
  "0xbe2ec156292587338d4e9f80f5439e6152d56fc5", "0x7a91e803db0e58b6fecc4e42c86b366778475e3c", "0x8f1aae22d0b4335945950d0bbd0f3743d3fc6f22", "0xfad70cb84e104817a7e9345d25ed0d3048af2d2d", "0x9db8b860692c41e709d48d089de64cf01e6e317e", "0x03d0aad7c6a0b36f47d852a28ff0fb7bc9ae46b6", "0xf683b33e21e85ee6c0e25af2fff5b2b115f32617", "0xcc5d36fb0126515cb7988bbeee8445f03c304b2a", "0xd049e4ddf1133af3a7a27390b4c9018141df1a49", "0xe7b29ff45392876143c7b863d57fb2326afe0ff1", "0x92ea7496eba5f001d620005f88f3e8e686e3d4ea", "0xa9ac43f5b5e38155a288d1a01d2cbc4478e14573", "0x0003b5aa5e30e97fcc596bb5d0f3a75255e08d4e", "0xb0a27099582833c0cb8c7a0565759ff145113d64", "0x5ca38fb7cf2b587026a1650f0d2b0a13c41f5d0f", "0xf418263a6468c80d3bcb71033c56aacf81b241ba", "0x3d2335cac7b31411467ef03168c5869452fb7e86", "0xdce83237fbf279c4522e7cac4b10428e2b8694da", "0x85dcd76d4fbd3aa0c85c27b9441222c19a14134b", "0x767a905b77b0a40801488c6af8b8b5992b43511c",
];
const LOCK_FILE = process.env.PUBLIC_FLOW_LOCK_FILE || path.join(process.cwd(), ".sites-runtime", "public-flow-collector.lock");
const LOCK_TOKEN = `${hostname()}:${process.pid}:${Date.now()}`;
let lockFd = null;
let valuationInsufficientTransfers = 0;

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

function readLock() {
  try { return JSON.parse(readFileSync(LOCK_FILE, "utf8")); } catch { return null; }
}

function acquireLock() {
  mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lockFd = openSync(LOCK_FILE, "wx");
      writeFileSync(lockFd, JSON.stringify({ token: LOCK_TOKEN, pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }));
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = readLock();
      if (owner?.host === hostname() && processAlive(Number(owner.pid))) throw new Error(`public flow collector already running (pid ${owner.pid})`);
      if (attempt === 0) { unlinkSync(LOCK_FILE); continue; }
      throw new Error("public flow collector lock could not be acquired");
    }
  }
}

function releaseLock() {
  if (lockFd !== null) { try { closeSync(lockFd); } catch {} lockFd = null; }
  const owner = readLock();
  if (owner?.token === LOCK_TOKEN) { try { unlinkSync(LOCK_FILE); } catch {} }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (value) => `0x${value.toString(16)}`;
const addressFromTopic = (value) => `0x${String(value || "").slice(-40)}`.toLowerCase();
const decimalAmount = (raw, decimals) => {
  const value = BigInt(raw); const base = 10n ** BigInt(decimals); const whole = value / base; const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
};

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
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ""}`);
  try { return JSON.parse(text); } catch { throw new Error(`invalid JSON response: ${text.slice(0, 120)}`); }
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
  return [
    ...direct.map((address) => ({ address, exchange: "Binance", source: "Binance 官方储备证明披露地址", attributionUrl: POR_PAGE })),
    ...BYBIT_ETH_ADDRESSES.map((address) => ({ address, exchange: "Bybit", source: "Bybit 官方储备证明审计文件披露地址", attributionUrl: BYBIT_POR_PDF })),
    ...OKX_ETH_ADDRESSES.map((address) => ({ address, exchange: "OKX", source: "OKX 官方储备证明快照披露地址（2026-09-08，区块 25926528）", attributionUrl: OKX_POR_ARCHIVE })),
  ];
}

function coverage(addresses) {
  const addressSetFingerprint = createHash("sha256").update(addresses.map((item) => `${item.exchange}:${item.address}`).sort().join("\n")).digest("hex");
  const rows = [
    { exchange: "Binance", source: POR_PAGE, scope: "官方储备证明中披露且未标为第三方托管方的 ETH 地址" },
    { exchange: "Bybit", source: BYBIT_POR_PAGE, scope: "官方储备证明审计文件披露的 Ethereum 地址" },
    { exchange: "OKX", source: OKX_POR_PAGE, scope: "官方 2026-09-08 储备快照中按 ETH 余额排序的前 20 个 Ethereum 地址；不是全部 8,817 个披露地址" },
    ...["Coinbase", "Upbit", "Kraken", "Bitget", "Gate", "MEXC", "HTX"].map((exchange) => ({ exchange, source: null, scope: "尚未找到可自动核验且可持续更新的官方披露地址，覆盖不足" })),
  ];
  return rows.map((row) => ({
    mode: "limited_known_address_sample", chain: "ethereum", assets: TOKENS.map((token) => token.symbol), exchange: row.exchange, addressSetFingerprint,
    addressCount: addresses.filter((item) => item.exchange === row.exchange).length, addressScope: row.scope, attributionSource: row.source,
    lastCollectedAt: new Date().toISOString(), rpcProvider: RPC_URL, rpcProviderName: "Tenderly 公共 Ethereum 网关", rpcSla: "匿名端点无公开服务等级保证",
    pricing: "无需注册、密钥或付费；匿名端点未公布固定配额，当前实测支持 100 区块日志查询、5 项批量请求与历史状态读取",
    valuation: "USDT/USDC 使用 1 美元名义值；UNI 使用对应区块的 Chainlink UNI/USD 喂价并校验时间",
    valuationInsufficientTransfers,
    omissions: ["未披露充值地址", "除列出地址外的其他钱包", "其他链", "未配置价格源的资产", "合约路由及链下内部账务"],
  }));
}

async function postHealth(status, addresses, cursor, error = null, events = [], mintEvents = []) {
  return site("/api/fund-flows/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "public_rpc", status, connectionStatus: status === "healthy" ? "connected" : "reconnecting", cursor: cursor == null ? null : String(cursor), coverage: coverage(addresses), error, events, mintEvents }) });
}

async function getState() {
  const response = await site("/api/fund-flows/collect?provider=public_rpc");
  const value = Number(response.state?.cursor);
  let previousAddressCount = 0; let previousAddressSetFingerprint = null;
  try { const parsed = JSON.parse(response.state?.coverage_json || "[]"); const first = parsed?.[0]; previousAddressCount = Number(parsed?.find((row) => row.exchange === "Binance")?.addressCount || 0); previousAddressSetFingerprint = typeof first?.addressSetFingerprint === "string" ? first.addressSetFingerprint : null; } catch { previousAddressCount = 0; }
  return { cursor: Number.isSafeInteger(value) && value >= 0 ? value : null, previousAddressCount, previousAddressSetFingerprint };
}

async function chainlinkPrice(token, blockNumber, blockTime) {
  let encoded;
  try { encoded = await rpc("eth_call", [{ to: token.priceFeed, data: "0xfeaf968c" }, blockNumber]); } catch { return null; }
  if (!/^0x[0-9a-f]{320}$/i.test(encoded)) return null;
  const words = encoded.slice(2).match(/.{64}/g); const answer = Number(BigInt(`0x${words[1]}`)) / 1e8; const updatedAt = Number(BigInt(`0x${words[3]}`));
  const priceAt = new Date(updatedAt * 1000).toISOString(); const ageMs = new Date(blockTime).getTime() - updatedAt * 1000;
  if (!Number.isFinite(answer) || answer <= 0 || answer > 1_000 || ageMs < 0 || ageMs > 7_200_000) return null;
  return { priceUsd: answer, priceAt, priceSource: token.priceSource, valuationMethod: "chainlink_historical_block_price" };
}

async function blockTimes(blockNumbers) {
  const result = new Map();
  for (let offset = 0; offset < blockNumbers.length; offset += RPC_BATCH_SIZE) {
    const batch = blockNumbers.slice(offset, offset + RPC_BATCH_SIZE).map((block, index) => ({ jsonrpc: "2.0", id: index + 1, method: "eth_getBlockByNumber", params: [block, false] }));
    const response = await retry("RPC block timestamps", () => jsonRequest(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch) }));
    if (!Array.isArray(response) || response.some((row) => row.error || !row.result?.timestamp)) throw new Error("partial block timestamp response");
    for (const row of response) result.set(row.result.number, new Date(Number.parseInt(row.result.timestamp, 16) * 1000).toISOString());
  }
  return result;
}

async function scan(from, to, addresses) {
  const logs = [];
  for (let offset = 0; offset < addresses.length; offset += ADDRESS_BATCH_SIZE) {
    const padded = addresses.slice(offset, offset + ADDRESS_BATCH_SIZE).map((item) => `0x${"0".repeat(24)}${item.address.slice(2)}`);
    for (const token of TOKENS) {
      for (const topics of [[TRANSFER_TOPIC, padded], [TRANSFER_TOPIC, null, padded]]) {
        const rows = await rpc("eth_getLogs", [{ fromBlock: hex(from), toBlock: hex(to), address: token.address, topics }]);
        if (!Array.isArray(rows)) throw new Error("partial eth_getLogs response");
        for (const row of rows) {
          const rawAmount = BigInt(row.data); const amount = Number(rawAmount) / 10 ** token.decimals;
          if (Number.isFinite(amount) && amount > 0) logs.push({ row, token, amount, rawAmount: String(rawAmount) });
        }
      }
    }
  }
  const unique = new Map(logs.map((entry) => [`${entry.row.transactionHash}:${entry.row.logIndex}:${entry.token.symbol}`, entry]));
  const times = await blockTimes([...new Set([...unique.values()].map((entry) => entry.row.blockNumber))]); const events = [];
  for (const { row, token, amount, rawAmount } of unique.values()) {
    const blockTimestamp = times.get(row.blockNumber); const price = token.valuation === "stablecoin" ? { priceUsd: 1, priceAt: blockTimestamp, priceSource: "发行方 1 美元锚定名义值", valuationMethod: "stablecoin_nominal_usd" } : await chainlinkPrice(token, row.blockNumber, blockTimestamp);
    if (!price) { valuationInsufficientTransfers += 1; continue; }
    if (amount * price.priceUsd < 10_000_000) continue;
    const fromAddress = addressFromTopic(row.topics[1]); const toAddress = addressFromTopic(row.topics[2]); const known = addresses.find((item) => item.address === fromAddress) || addresses.find((item) => item.address === toAddress);
    events.push({ chain: "ethereum", txHash: row.transactionHash, logIndex: Number.parseInt(row.logIndex, 16), blockNumber: Number.parseInt(row.blockNumber, 16), blockTimestamp, symbol: token.symbol, tokenContract: token.address, rawAmount, amount: decimalAmount(rawAmount, token.decimals), ...price, fromAddress, toAddress, trackedEntities: addresses, sourceUrl: `https://etherscan.io/tx/${row.transactionHash}`, attributionUrl: known?.attributionUrl || null });
  }
  return events;
}

async function scanMints(from, to) {
  const matches = [];
  for (const token of TOKENS.filter((item) => item.mintTopic)) {
    const rows = await rpc("eth_getLogs", [{ fromBlock: hex(from), toBlock: hex(to), address: token.address, topics: [token.mintTopic] }]);
    if (!Array.isArray(rows)) throw new Error("partial stablecoin mint log response");
    for (const row of rows) { const rawAmount = BigInt(`0x${row.data.slice(-64)}`); const amount = Number(rawAmount) / 10 ** token.decimals; if (Number.isFinite(amount) && amount > 100_000_000) matches.push({ row, token, rawAmount: String(rawAmount), amount }); }
  }
  const times = await blockTimes([...new Set(matches.map((entry) => entry.row.blockNumber))]);
  return matches.map(({ row, token, rawAmount }) => ({ chain: "ethereum", txHash: row.transactionHash, logIndex: Number.parseInt(row.logIndex, 16), blockTimestamp: times.get(row.blockNumber), symbol: token.symbol, tokenContract: token.address, rawAmount, amount: decimalAmount(rawAmount, token.decimals), recipientAddress: token.symbol === "USDC" ? addressFromTopic(row.topics[2]) : null, evidenceType: token.mintEvidence, sourceUrl: `https://etherscan.io/tx/${row.transactionHash}`, contractEvidenceUrl: token.issuerUrl }));
}

async function cycle() {
  valuationInsufficientTransfers = 0;
  const addresses = await officialAddresses();
  const state = await getState();
  const binanceCount = addresses.filter((item) => item.exchange === "Binance").length;
  if (state.previousAddressCount > 0 && binanceCount < Math.ceil(state.previousAddressCount * 0.7)) throw new Error(`partial Binance PoR response: ${binanceCount}/${state.previousAddressCount} addresses`);
  lastAddresses = addresses;
  const latest = Number.parseInt(await rpc("eth_blockNumber", []), 16) - CONFIRMATIONS;
  let cursor = state.cursor;
  const currentAddressSetFingerprint = createHash("sha256").update(addresses.map((item) => `${item.exchange}:${item.address}`).sort().join("\n")).digest("hex");
  if (cursor !== null && state.previousAddressSetFingerprint !== currentAddressSetFingerprint) cursor = Math.min(cursor, Math.max(0, latest - INITIAL_BACKFILL - 1));
  if (cursor === null) cursor = Math.max(0, latest - INITIAL_BACKFILL - 1);
  while (cursor < latest) {
    const from = cursor + 1; const to = Math.min(latest, from + CHUNK_SIZE - 1);
    const [events, mintEvents] = await Promise.all([scan(from, to, addresses), scanMints(from, to)]);
    const result = await postHealth("healthy", addresses, to, null, events, mintEvents);
    console.log(JSON.stringify({ at: new Date().toISOString(), from, to, addresses: addresses.length, candidates: events.length, mintCandidates: mintEvents.length, inserted: result.inserted, mintsInserted: result.mintsInserted, deduped: result.deduped }));
    cursor = to;
  }
  if (cursor >= latest) await postHealth("healthy", addresses, cursor);
}

const started = Date.now();
let lastAddresses = [];
let consecutiveFailures = 0;
try {
  acquireLock();
  process.once("SIGINT", () => { releaseLock(); process.exit(130); });
  process.once("SIGTERM", () => { releaseLock(); process.exit(143); });
  do {
    try { await cycle(); consecutiveFailures = 0; }
    catch (error) {
      consecutiveFailures++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ at: new Date().toISOString(), status: "degraded", consecutiveFailures, error: message }));
      await postHealth("degraded", lastAddresses, null, message).catch(() => {});
      if (consecutiveFailures >= MAX_FAILURES) throw new Error(`collector failed ${consecutiveFailures} consecutive cycles: ${message}`);
    }
    const delay = consecutiveFailures ? Math.min(300_000, POLL_MS * 2 ** Math.min(consecutiveFailures - 1, 4)) : POLL_MS;
    if ((!CONTINUOUS && RUN_MS <= 0) || (RUN_MS > 0 && Date.now() + delay >= started + RUN_MS)) break;
    await sleep(delay);
  } while (CONTINUOUS || Date.now() < started + RUN_MS);
} finally {
  releaseLock();
}
