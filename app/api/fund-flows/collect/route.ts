import { env } from "cloudflare:workers";
import { MIN_FLOW_USD, normalizeBitqueryTransfers, normalizePublicRpcTransfer, normalizeWhaleAlerts, type BitqueryAddressLabel } from "@/lib/fund-flows";
import { isMonitorAuthorized } from "@/lib/monitor-auth";

export const dynamic = "force-dynamic";
type JsonRecord = Record<string, unknown>;
type Provider = "whale_alert" | "bitquery" | "public_rpc";
const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const allowedProviders = new Set<Provider>(["whale_alert", "bitquery", "public_rpc"]);

async function sha(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bitqueryDistributionApproved() {
  return String((env as unknown as Record<string, unknown>).BITQUERY_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
}

function whaleAlertDistributionApproved() {
  return String((env as unknown as Record<string, unknown>).WHALE_ALERT_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
}

async function updateHealth(db: D1Database, provider: Provider, input: { status: string; cursor?: string | null; connectionStatus?: string; lastEventAt?: string | null; error?: string | null; coverage?: unknown[]; latencyMs?: number }) {
  const now = new Date().toISOString();
  const previous = await db.prepare("SELECT consecutive_failures FROM fund_flow_collector_state WHERE source=?").bind(provider).first<{ consecutive_failures: number }>();
  const failures = input.status === "healthy" ? 0 : (previous?.consecutive_failures || 0) + 1;
  await db.prepare("INSERT INTO fund_flow_collector_state (source,status,cursor,connection_status,last_attempt_at,last_success_at,last_event_at,last_heartbeat_at,consecutive_failures,next_retry_at,last_latency_ms,last_error,coverage_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET status=excluded.status,cursor=COALESCE(excluded.cursor,fund_flow_collector_state.cursor),connection_status=excluded.connection_status,last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN excluded.status='healthy' THEN excluded.last_success_at ELSE fund_flow_collector_state.last_success_at END,last_event_at=COALESCE(excluded.last_event_at,fund_flow_collector_state.last_event_at),last_heartbeat_at=excluded.last_heartbeat_at,consecutive_failures=excluded.consecutive_failures,next_retry_at=excluded.next_retry_at,last_latency_ms=excluded.last_latency_ms,last_error=excluded.last_error,coverage_json=CASE WHEN excluded.coverage_json='[]' AND fund_flow_collector_state.coverage_json!='[]' THEN fund_flow_collector_state.coverage_json ELSE excluded.coverage_json END")
    .bind(provider, input.status, input.cursor || null, input.connectionStatus || "connected", now, input.status === "healthy" ? now : null, input.lastEventAt || null, now, failures, input.status === "healthy" ? null : new Date(Date.now() + Math.min(300_000, 2 ** Math.min(failures, 8) * 1000)).toISOString(), input.latencyMs || 0, input.error || null, JSON.stringify(input.coverage || [])).run();
}

function authorized(request: Request) {
  const source = env as unknown as Record<string, unknown>;
  return isMonitorAuthorized(request, typeof source.MONITOR_SECRET === "string" ? source.MONITOR_SECRET : "");
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const provider = new URL(request.url).searchParams.get("provider") as Provider;
  if (!allowedProviders.has(provider)) return Response.json({ error: "invalid_provider" }, { status: 400 });
  const state = await env.DB.prepare("SELECT source,status,cursor,connection_status,last_event_at,last_heartbeat_at,last_error,coverage_json FROM fund_flow_collector_state WHERE source=?").bind(provider).first<Record<string, unknown>>();
  return Response.json({ state: state || null, publicDistributionApproved: provider === "bitquery" ? bitqueryDistributionApproved() : provider === "whale_alert" ? whaleAlertDistributionApproved() : false });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  let body: JsonRecord;
  try { body = asRecord(await request.json()); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const provider = String(body.provider || "whale_alert") as Provider;
  if (!allowedProviders.has(provider)) return Response.json({ error: "invalid_provider" }, { status: 400 });
  const records = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  const allowBitquery = bitqueryDistributionApproved();
  const allowWhaleAlert = whaleAlertDistributionApproved();
  if (provider === "bitquery" && records.length && !allowBitquery) {
    await updateHealth(env.DB, provider, { status: "blocked", connectionStatus: "license_not_approved", error: "Bitquery 公开网页展示授权尚未确认", coverage: Array.isArray(body.coverage) ? body.coverage : [] });
    return Response.json({ error: "bitquery_public_distribution_not_approved" }, { status: 403 });
  }
  if (provider === "whale_alert" && records.length && !allowWhaleAlert) {
    await updateHealth(env.DB, provider, { status: "blocked", connectionStatus: "license_not_approved", error: "Whale Alert 公开网页展示授权尚未确认", coverage: Array.isArray(body.coverage) ? body.coverage : [] });
    return Response.json({ error: "whale_alert_public_distribution_not_approved" }, { status: 403 });
  }
  const now = new Date().toISOString();
  const labels = Array.isArray(body.labels) ? body.labels.map(asRecord).map((row) => ({ address: String(row.address || ""), chain: String(row.chain || ""), type: String(row.type || ""), value: String(row.value || ""), recordedAt: row.recordedAt ? String(row.recordedAt) : null })).filter((row) => row.address && row.type && row.value) as BitqueryAddressLabel[] : [];
  let inserted = 0; let deduped = 0; let rejected = 0;
  for (const value of records) {
    const record = asRecord(value);
    const item = provider === "public_rpc" ? normalizePublicRpcTransfer(record, now) : null;
    const items = provider === "bitquery" ? normalizeBitqueryTransfers(record, String(record.chain || body.chain || "unknown"), labels, now) : provider === "public_rpc" ? (item ? [item] : []) : normalizeWhaleAlerts(record, now);
    if (!items.length) { rejected++; continue; }
    for (const item of items) {
      const fingerprint = await sha(item.rawFingerprint);
      const result = await env.DB.prepare("INSERT OR IGNORE INTO fund_flow_events (event_key,provider,chain,symbol,amount,amount_usd,price_usd,price_at,valuation_method,tx_hash,source_url,attribution_url,from_address,to_address,from_entity,to_entity,from_label_source,to_label_source,label_confidence,direction,classification,counts_toward_netflow,institution_trade_side,bridge_name,chain_occurred_at,discovered_at,raw_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
        .bind(item.eventKey, item.provider, item.chain, item.symbol, item.amount, item.amountUsd, item.priceUsd, item.priceAt, "valuationMethod" in item ? item.valuationMethod : null, item.txHash, "sourceUrl" in item ? item.sourceUrl : null, "attributionUrl" in item ? item.attributionUrl : null, item.fromAddress, item.toAddress, item.fromEntity, item.toEntity, item.fromLabelSource, item.toLabelSource, item.labelConfidence, item.direction, item.classification, item.countsTowardNetflow ? 1 : 0, null, item.bridgeName, item.chainOccurredAt, item.discoveredAt, fingerprint).first<{ id: number }>();
      if (result) {
        inserted++;
      } else deduped++;
    }
  }
  await updateHealth(env.DB, provider, { status: String(body.status || "healthy"), cursor: body.cursor ? String(body.cursor) : null, connectionStatus: String(body.connectionStatus || "connected"), lastEventAt: inserted ? now : null, error: body.error ? String(body.error).slice(0, 300) : null, coverage: Array.isArray(body.coverage) ? body.coverage : [], latencyMs: Number(body.latencyMs || 0) });
  return Response.json({ ok: true, provider, minimumUsd: MIN_FLOW_USD, inserted, deduped, rejected, notifications: { enabled: false, mode: "web_only" } });
}
