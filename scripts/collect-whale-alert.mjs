const site = String(process.env.SITE_URL || "").replace(/\/$/, ""); const secret = process.env.MONITOR_SECRET || ""; const apiKey = process.env.WHALE_ALERT_API_KEY || "";
if (!site || !secret) throw new Error("SITE_URL or MONITOR_SECRET missing");
const post = async (payload) => { const response = await fetch(`${site}/api/fund-flows/collect`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`fund-flow ingest HTTP ${response.status}: ${(await response.text()).slice(0,300)}`); };
if (!apiKey) { await post({ status: "blocked", connectionStatus: "not_configured", error: "WHALE_ALERT_API_KEY 未配置；未启动付费服务", coverage: [] }); throw new Error("WHALE_ALERT_API_KEY missing"); }
const supported = await fetch("https://leviathan.whale-alert.io/status", { signal: AbortSignal.timeout(15_000) }).then((r) => r.ok ? r.json() : []).catch(() => []);
const coverage = Array.isArray(supported) ? supported.map((x) => ({ chain: x.name, symbols: x.symbols })) : [];
const subscriptionId = "kol-flow-10m-v1"; const deadline = Date.now() + Number(process.env.COLLECTOR_DURATION_MS || 2_700_000); let delay = 1_000;
while (Date.now() < deadline) {
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://leviathan.whale-alert.io/ws?api_key=${encodeURIComponent(apiKey)}`); let heartbeat = Date.now(); const buffer = [];
      const flush = async () => { if (!buffer.length) return; const events = buffer.splice(0, 100); await post({ status: "healthy", connectionStatus: "connected", cursor: subscriptionId, coverage, events }); };
      const timer = setInterval(() => { if (Date.now() - heartbeat > 90_000) { ws.close(); return; } void flush().catch(reject); }, 10_000);
      ws.addEventListener("open", () => { heartbeat = Date.now(); ws.send(JSON.stringify({ type: "subscribe_alerts", id: subscriptionId, tx_types: ["transfer"], min_value_usd: 10_000_000 })); });
      ws.addEventListener("message", (event) => { heartbeat = Date.now(); try { const data = JSON.parse(String(event.data)); if (data.type === "alert") buffer.push(data); } catch {} if (buffer.length >= 20) void flush().catch(reject); });
      ws.addEventListener("error", () => { clearInterval(timer); reject(new Error("whale_alert_websocket_error")); });
      ws.addEventListener("close", () => { clearInterval(timer); void flush().finally(resolve); });
      setTimeout(() => ws.close(), Math.min(300_000, Math.max(1_000, deadline-Date.now())));
    });
    delay = 1_000;
  } catch (error) { await post({ status: "degraded", connectionStatus: "reconnecting", cursor: subscriptionId, error: error instanceof Error ? error.message : String(error), coverage }).catch(()=>{}); await new Promise((resolve)=>setTimeout(resolve,delay)); delay=Math.min(delay*2,60_000); }
}
