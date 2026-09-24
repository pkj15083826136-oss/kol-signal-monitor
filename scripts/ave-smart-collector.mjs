import { chromium } from "@playwright/test";
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const site = String(process.env.AVE_COLLECTOR_SITE_URL || "").replace(/\/$/, "");
const secret = String(process.env.AVE_COLLECTOR_SECRET || "");
const profileDir = String(process.env.AVE_COLLECTOR_PROFILE_DIR || "");
const stateDir = String(process.env.AVE_COLLECTOR_STATE_DIR || "");
if (!site || !secret || !profileDir || !stateDir) {
  throw new Error("采集器缺少必要的本机安全配置，请使用一键启动脚本");
}
if (profileDir.includes(".git") || profileDir.includes("链上早期信号")) {
  throw new Error("浏览器会话目录必须位于仓库之外");
}

await mkdir(profileDir, { recursive: true });
await mkdir(stateDir, { recursive: true });
const pidFile = path.join(stateDir, "ave-collector.pid");
const queueFile = path.join(stateDir, "upload-queue.json");
const logFile = path.join(stateDir, "ave-collector.jsonl");
try {
  const existingPid = Number((await readFile(pidFile, "utf8")).trim());
  if (Number.isInteger(existingPid) && existingPid > 0) {
    try { process.kill(existingPid, 0); throw new Error(`采集器已在运行（PID ${existingPid}）`); } catch (error) { if (error instanceof Error && error.message.includes("已在运行")) throw error; }
  }
  await unlink(pidFile).catch(() => {});
} catch (error) { if (error instanceof Error && error.message.includes("已在运行")) throw error; }
await writeFile(pidFile, String(process.pid), "utf8");

const instanceId = randomUUID();
const seen = new Set();
const stats = {
  connectionStatus: "starting",
  loginStatus: "unknown",
  websocketStatus: "connecting",
  lastEventAt: null,
  lastUploadAt: null,
  capturedCount: 0,
  uploadedCount: 0,
  dedupCount: 0,
  uploadFailedCount: 0,
  parseFailedCount: 0,
  unsupportedCount: 0,
  invalidCount: 0,
};
let stopping = false;
let activeContext = null;
let uploadQueue = [];
let flushPromise = null;
try { const stored = JSON.parse(await readFile(queueFile, "utf8")); if (Array.isArray(stored)) uploadQueue = stored.slice(0, 5_000); } catch { uploadQueue = []; }

async function log(event, detail = {}) {
  await appendFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`, "utf8").catch(() => {});
}

async function saveQueue() {
  const temporary = `${queueFile}.tmp`;
  await writeFile(temporary, JSON.stringify(uploadQueue.slice(0, 5_000)), "utf8");
  await rename(temporary, queueFile);
}

function collectorStatus() {
  return { instanceId, ...stats };
}

async function send(candidates = [], status = "healthy", error = "") {
  const response = await fetch(`${site}/api/radar/collect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "ave_smart_browser",
      status,
      error: String(error).slice(0, 300),
      heartbeatAt: new Date().toISOString(),
      collector: collectorStatus(),
      candidates,
    }),
  });
  if (!response.ok) { stats.uploadFailedCount += candidates.length || 1; throw new Error(`采集接口返回 ${response.status}`); }
  if (candidates.length) {
    stats.uploadedCount += candidates.length;
    stats.lastUploadAt = new Date().toISOString();
  }
}

async function flushQueue(status = "healthy", error = "") {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (!uploadQueue.length) { await send([], status, error); return; }
    const batch = uploadQueue.slice(0, 30);
    try {
      await send(batch, status, error);
      const uploadedIds = new Set(batch.map((item) => item.sourceEventId));
      uploadQueue = uploadQueue.filter((item) => !uploadedIds.has(item.sourceEventId));
      await saveQueue();
      await log("upload_success", { count: batch.length, queued: uploadQueue.length });
    } catch (uploadError) {
      await saveQueue();
      await log("upload_failed", { count: batch.length, queued: uploadQueue.length, reason: uploadError instanceof Error ? uploadError.message.slice(0, 120) : "unknown" });
      throw uploadError;
    }
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}

async function post(candidates = [], status = "healthy", error = "") {
  if (candidates.length) {
    const known = new Set(uploadQueue.map((item) => item.sourceEventId));
    for (const candidate of candidates) if (!known.has(candidate.sourceEventId)) { uploadQueue.push(candidate); known.add(candidate.sourceEventId); }
    await saveQueue();
  }
  return flushQueue(status, error);
}

function chainOf(value) {
  const chain = String(value || "").toLowerCase();
  if (chain.includes("sol")) return "sol";
  if (chain.includes("base")) return "base";
  if (chain.includes("robinhood")) return "robinhood";
  if (chain.includes("bsc") || chain.includes("bnb")) return "bsc";
  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asIso(value) {
  const parsed = Number(value);
  const date = Number.isFinite(parsed)
    ? new Date(parsed < 1e12 ? parsed * 1000 : parsed)
    : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function mapRows(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const candidates = [];
  for (const row of rows) {
    if (!row?.id) { stats.parseFailedCount += 1; continue; }
    const eventId = String(row.id);
    if (seen.has(eventId)) {
      stats.dedupCount += 1;
      continue;
    }
    seen.add(eventId);
    const tokenAddress = String(row.token || "").trim();
    if (!tokenAddress) { stats.invalidCount += 1; continue; }
    const chain = chainOf(row.chain); if (!chain) { stats.unsupportedCount += 1; continue; }
    stats.capturedCount += 1;
    candidates.push({
      source: "ave_smart_browser",
      sourceEventId: eventId,
      chain,
      tokenAddress,
      pairAddress: typeof row.amm === "string" ? row.amm : null,
      name: String(row.token_name || row.symbol || "Unknown"),
      symbol: String(row.symbol || "—"),
      firstSeenAt: asIso(row.signal_time || row.first_signal_time || Date.now()),
      poolCreatedAt: row.pair_create_time || row.pool_created_at ? asIso(row.pair_create_time || row.pool_created_at) : null,
      price: row.current_price_usd == null ? null : String(row.current_price_usd),
      marketCap: asNumber(row.mc_cur ?? row.mc),
      liquidity: null,
      volume24h: asNumber(row.tx_volume_u_24h),
      holders: asNumber(row.holders_cur ?? row.holders),
      buyers: null,
      sellers: null,
      smartMoneyCount: asNumber(row.action_count) || 0,
      dataFetchedAt: new Date().toISOString(),
      identityVerified: false,
      sellSimulationPassed: null,
      honeypot: null,
      mintable: null,
      freezable: null,
      blacklistable: null,
      taxModifiable: null,
      buyTaxBps: null,
      sellTaxBps: null,
      lpLocked: null,
      topHolderPct: asNumber(row.top10_ratio),
      developerRisk: "unknown",
      priceImpactBps: null,
      sourceConflict: false,
      sourceProjectDescription: String(row.headline || row.description || row.token_tag || row.tag || "").trim() || null,
      sourceDescriptionRaw: String(row.headline || row.description || row.token_tag || row.tag || "").trim() || null,
      sourceDescriptionAt: asIso(row.signal_time || row.first_signal_time || Date.now()),
      sourceDescriptionSource: "ave_smart_browser",
      knownProjectAccount: typeof row.twitter === "string" ? row.twitter : null,
      avatar_url: row.logo || row.token_logo || row.token_icon || row.icon || row.image || row.avatar || null,
      rawSnapshot: {
        id: row.id,
        token: row.token,
        chain: row.chain,
        signal_time: row.signal_time,
        signal_type: row.signal_type,
        headline: row.headline,
        tag: row.tag,
        issue_platform: row.issue_platform,
        first_signal_mc: row.first_signal_mc,
        mc_cur: row.mc_cur,
        holders_cur: row.holders_cur,
        top10_ratio: row.top10_ratio,
        current_price_usd: row.current_price_usd,
        avatar_url: row.logo || row.token_logo || row.token_icon || row.icon || row.image || row.avatar || null,
        logo: row.logo || row.token_logo || row.token_icon || row.icon || row.image || row.avatar || null,
        token_create_time: row.token_create_time || row.created_at || null,
        pair_create_time: row.pair_create_time || row.pool_created_at || null,
        liquidity: row.liquidity || row.liquidity_usd || null,
        buyers_24h: row.buyers_24h || row.buyer_count_24h || null,
        sellers_24h: row.sellers_24h || row.seller_count_24h || null,
        buy_tx_24h: row.buy_tx_24h || row.buys_24h || null,
        sell_tx_24h: row.sell_tx_24h || row.sells_24h || null,
      },
    });
  }
  return candidates;
}

async function runBrowser() {
  stats.connectionStatus = "connecting";
  stats.websocketStatus = "connecting";
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: "msedge",
  });
  activeContext = context;
  const page = context.pages()[0] || await context.newPage();
  const browserStartedAt = Date.now();
  let reloadInFlight = false;
  let reconnectAttempt = 0;
  let nextReconnectAt = 0;
  stats.connectionStatus = "connected";

  page.on("websocket", (socket) => {
    stats.websocketStatus = "connected";
    reconnectAttempt = 0;
    socket.on("framereceived", () => {
      stats.lastEventAt = new Date().toISOString();
    });
    socket.on("close", () => {
      stats.websocketStatus = "disconnected";
      reconnectAttempt += 1;
      nextReconnectAt = Date.now() + Math.min(60_000, 1_000 * 2 ** Math.min(reconnectAttempt, 6));
    });
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "websocket") stats.websocketStatus = "disconnected";
  });
  page.on("crash", () => { void log("page_crash"); void context.close().catch(() => {}); });
  page.on("close", () => { if (!stopping) { void log("page_closed"); void context.close().catch(() => {}); } });
  page.on("response", async (response) => {
    if (!response.url().includes("/v2api/signals/v2/public/list/v4")) return;
    stats.lastEventAt = new Date().toISOString();
    if (response.status() === 401 || response.status() === 403) {
      stats.loginStatus = "required";
      await post([], "login_expired", `Ave接口返回 ${response.status()}`).catch(() => {});
      return;
    }
    if (!response.ok()) return;
    try {
      const candidates = mapRows(await response.json());
      stats.loginStatus = "not_required";
      if (stats.websocketStatus === "connecting") stats.websocketStatus = "not_observed";
      await post(candidates, "healthy");
    } catch (error) {
      await post([], "error", error instanceof Error ? error.message : "parse_failed").catch(() => {});
    }
  });

  await page.goto("https://ave.ai/smart", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await post([], "healthy");
  const timer = setInterval(() => {
    void post([], stats.connectionStatus === "connected" ? "healthy" : "error").catch((error) => {
      console.error(`[${instanceId.slice(0, 8)}] 心跳上传失败：${error instanceof Error ? error.message : "unknown"}`);
    });
    const lastStructuredEvent = stats.lastEventAt ? new Date(stats.lastEventAt).getTime() : browserStartedAt;
    const disconnected = stats.websocketStatus === "disconnected" && Date.now() >= nextReconnectAt;
    if (stats.loginStatus !== "required" && !reloadInFlight && (disconnected || Date.now() - lastStructuredEvent > 120_000)) {
      reloadInFlight = true;
      void page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 })
        .then(() => log("page_reloaded", { reconnectAttempt }))
        .catch((error) => { void log("page_reload_failed", { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" }); console.error(`[${instanceId.slice(0, 8)}] 页面恢复失败：${error instanceof Error ? error.message : "unknown"}`); })
        .finally(() => { reloadInFlight = false; });
    }
  }, 30_000);
  await new Promise((resolve) => context.once("close", resolve));
  activeContext = null;
  clearInterval(timer);
  stats.connectionStatus = "disconnected";
  stats.websocketStatus = "disconnected";
}

async function stop() {
  stopping = true;
  await activeContext?.close().catch(() => {});
  await unlink(pidFile).catch(() => {});
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });

console.log(`[${instanceId.slice(0, 8)}] Ave Smart采集器已启动；浏览器会话仅保存在本机。`);
await log("collector_started", { instanceId, queued: uploadQueue.length });
while (!stopping) {
  try {
    await runBrowser();
  } catch (error) {
    stats.connectionStatus = "disconnected";
    stats.websocketStatus = "disconnected";
    const message = error instanceof Error ? error.message : "collector_failed";
    await post([], "error", message).catch(() => {});
    console.error(`[${instanceId.slice(0, 8)}] 采集器将自动恢复：${message}`);
    await log("collector_restarting", { reason: message.slice(0, 120) });
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5_000));
}
await unlink(pidFile).catch(() => {});
