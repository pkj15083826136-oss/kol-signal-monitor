import crypto from "node:crypto";
import WebSocket from "ws";

const site = String(process.env.SITE_URL || "").replace(/\/$/, "");
const monitorSecret = process.env.MONITOR_SECRET || "";
const accessKey = process.env.UPBIT_ACCESS_KEY || "";
const secretKey = process.env.UPBIT_SECRET_KEY || "";
const deadline = Date.now() + Number(process.env.COLLECTOR_DURATION_MS || 1_980_000);
if (!site || !monitorSecret) throw new Error("SITE_URL or MONITOR_SECRET missing");
if (!accessKey || !secretKey) throw new Error("UPBIT_ACCESS_KEY or UPBIT_SECRET_KEY missing");

const base64url = (value) => Buffer.from(value).toString("base64url");
const jwt = () => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() }));
  const signature = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
};
const post = async (payload) => {
  const response = await fetch(`${site}/api/exchange-events/collect`, { method: "POST", headers: { authorization: `Bearer ${monitorSecret}`, "content-type": "application/json" }, body: JSON.stringify({ mode: "upbit_stream", ...payload }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`upbit ingest HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
};

let delay = 1_000;
while (Date.now() < deadline) {
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket("wss://api.upbit.com/websocket/v1/private", { headers: { Authorization: `Bearer ${jwt()}` } });
      const buffer = []; let lastMessageAt = Date.now(); let pingOutstandingAt = 0; let settled = false;
      const finish = (error) => { if (settled) return; settled = true; clearInterval(timer); clearTimeout(closeTimer); if (error) reject(error); else resolve(); };
      const flush = async () => { const events = buffer.splice(0, 100); await post({ status: "healthy", events }); };
      const timer = setInterval(() => { const now=Date.now(); if (pingOutstandingAt && now-pingOutstandingAt>30_000){ws.terminate();finish(new Error("upbit_pong_timeout"));return} if (now-lastMessageAt>90_000&&!pingOutstandingAt){pingOutstandingAt=now;ws.ping()} void flush().catch((error) => { ws.close(); finish(error); }); }, 30_000);
      const closeTimer = setTimeout(() => ws.close(1000, "collector rotation"), Math.max(1_000, deadline - Date.now()));
      ws.on("open", () => { lastMessageAt = Date.now(); ws.send(JSON.stringify([{ ticket: "kol-exchange-announcements" }, { type: "announcement", categories: ["trade"], include_body: false }, { format: "DEFAULT" }])); void post({ status: "healthy", events: [] }).catch((error) => finish(error)); });
      ws.on("pong", () => { lastMessageAt = Date.now(); pingOutstandingAt=0; });
      ws.on("message", (payload) => { lastMessageAt = Date.now(); pingOutstandingAt=0; try { const event = JSON.parse(payload.toString()); if (event?.type === "announcement") buffer.push(event); else if (event?.error) throw new Error(`upbit_${event.error.name || "error"}: ${event.error.message || "unknown"}`); } catch (error) { if (error instanceof SyntaxError) return; finish(error); } if (buffer.length >= 20) void flush().catch((error) => finish(error)); });
      ws.on("error", (error) => finish(error));
      ws.on("close", () => { void flush().then(() => finish()).catch((error) => finish(error)); });
    });
    delay = 1_000;
  } catch (error) {
    await post({ status: "error", error: error instanceof Error ? error.message : String(error), events: [] }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, Math.max(0, deadline - Date.now()))));
    delay = Math.min(delay * 2, 60_000);
  }
}
