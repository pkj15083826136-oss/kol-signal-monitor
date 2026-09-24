import WebSocket from "ws";

const enabled = String(process.env.NEW_LISTINGS_FEED_ENABLED || "").toLowerCase() === "true";
if (!enabled) {
  console.log("New Listings Feed adapter is disabled; official pair snapshots remain active.");
  process.exit(0);
}
const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const secret = process.env.MONITOR_SECRET || "";
const apiKey = process.env.NLF_API_KEY || "";
if (!site || !secret || !apiKey) throw new Error("SITE_URL, MONITOR_SECRET and NLF_API_KEY are required when enabled");

const endpoint = "wss://ws.newlistings.pro/v2/full?exchange=coinbase,upbit&category=crypto";
const deadline = Date.now() + Number(process.env.COLLECTOR_DURATION_MS || 2_700_000);
let retryMs = 1_000;

function retryAfterMs(value = "") {
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  return Math.max(0, Date.parse(value) - Date.now()) || 0;
}

async function post(payload) {
  const response = await fetch(`${site}/api/exchange-events/collect`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ mode: "new_listings_feed", ...payload }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`new-listings ingest HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

while (Date.now() < deadline) {
  try {
    const session = await new Promise((resolve) => {
      const ws = new WebSocket(endpoint, { headers: { authorization: `Bearer ${apiKey}` }, handshakeTimeout: 10_000 });
      const buffer = [];
      let ready = false;
      let heartbeatAt = Date.now();
      let sessionError = null;
      let stop = false;
      let minimumWaitMs = 0;
      const flush = async () => {
        if (!buffer.length) return;
        const events = buffer.slice(0, 100);
        await post({ status: "healthy", cursor: JSON.stringify({ lastReceivedAt: new Date().toISOString() }), events });
        buffer.splice(0, events.length);
      };
      const timer = setInterval(() => {
        if (Date.now() - heartbeatAt > 90_000) return ws.terminate();
        ws.ping();
        void flush().catch((error) => { sessionError = error; ws.terminate(); });
      }, 10_000);
      const closeTimer = setTimeout(() => ws.close(), Math.min(300_000, Math.max(1_000, deadline - Date.now())));
      ws.on("pong", () => { heartbeatAt = Date.now(); });
      ws.on("message", (raw) => {
        heartbeatAt = Date.now();
        let message;
        try { message = JSON.parse(raw.toString()); } catch { sessionError = new Error("new-listings invalid JSON"); stop = true; ws.close(); return; }
        if (message?.type === "success" && message?.code === "READY") { ready = true; retryMs = 1_000; return; }
        if (message?.type === "error") { sessionError = new Error(`${message.code || "feed_error"}: ${message.message || "unknown"}`); stop = message.code !== "SERVER_UNAVAILABLE"; ws.close(); return; }
        if ((message?.type === "announcement" || message?.type === "tweet") && ["coinbase", "upbit"].includes(String(message?.parser?.exchange))) buffer.push(message);
        if (buffer.length >= 20) void flush().catch((error) => { sessionError = error; ws.terminate(); });
      });
      ws.on("unexpected-response", (_request, response) => {
        minimumWaitMs = retryAfterMs(String(response.headers["retry-after"] || ""));
        stop = response.statusCode < 500 && response.statusCode !== 408 && response.statusCode !== 429;
        sessionError = new Error(`new-listings upgrade HTTP ${response.statusCode}`);
        response.resume();
        ws.terminate();
      });
      ws.on("error", (error) => { sessionError ||= error; });
      ws.on("close", () => {
        clearInterval(timer);
        clearTimeout(closeTimer);
        void flush().catch((error) => { sessionError ||= error; }).finally(() => resolve({ ready, stop, minimumWaitMs, error: sessionError }));
      });
    });
    if (session.stop) throw Object.assign(session.error || new Error("new-listings connection stopped"), { permanent: true });
    if (session.error || !session.ready) throw Object.assign(session.error || new Error("new-listings closed before READY"), { minimumWaitMs: session.minimumWaitMs });
  } catch (error) {
    await post({ status: "degraded", error: error instanceof Error ? error.message : String(error), events: [] }).catch(() => {});
    if (error?.permanent) throw error;
    const waitMs = Math.max(retryMs, Number(error?.minimumWaitMs || 0)) + Math.random() * 250;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    retryMs = Math.min(retryMs * 2, 30_000);
  }
}
