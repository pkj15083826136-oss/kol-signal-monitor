import { env } from "cloudflare:workers";
import { acquireApiLock, assertApiBudget, readApiCache, recordExternalHttp, releaseApiLock, storeApiCache, tokenCacheKey } from "@/lib/external-api-control";

type JsonRecord = Record<string, unknown>;

function runtimeEnv(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

async function gmgnRequest(path: string, params: Record<string, string | number>, task: string) {
  const apiKey = runtimeEnv("GMGN_API_KEY");
  if (!apiKey) throw new Error("GMGN_API_KEY 未配置");
  const db = env.DB;
  await assertApiBudget(db, "gmgn", "basic");
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Math.floor(Date.now() / 1000)),
    client_id: crypto.randomUUID(),
  });
  const started = Date.now(); let response: Response;
  try {
    response = await fetch(`https://openapi.gmgn.ai${path}?${query}`, { headers: { "X-APIKEY": apiKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    await recordExternalHttp(db, { provider: "gmgn", tier: "basic", endpoint: path, task, chain: String(params.chain || ""), status: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network_error", latencyMs: Date.now() - started, retryNumber: 0 });
    throw error;
  }
  await recordExternalHttp(db, { provider: "gmgn", tier: "basic", endpoint: path, task, chain: String(params.chain || ""), status: response.ok ? "success" : "http_error", httpStatus: response.status, latencyMs: Date.now() - started, retryNumber: 0, rateLimited: response.status === 429 });
  const payload = (await response.json()) as { code?: number; data?: unknown; message?: string; error?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || payload.error || `GMGN HTTP ${response.status}`);
  }
  return payload.data;
}

export function getKolTrades(chain: string) {
  return gmgnRequest("/v1/user/kol", { chain, limit: 200 }, "monitor_kol_feed");
}

export function getSmartMoneyTrades(chain: string) {
  return gmgnRequest("/v1/user/smartmoney", { chain, limit: 200 }, "monitor_smartmoney_feed");
}

export async function getTokenInfo(chain: string, address: string) {
  const db = env.DB; const endpoint = "/v1/token/info"; const cacheKey = tokenCacheKey("gmgn", endpoint, chain, address);
  const cached = await readApiCache<unknown>(db, cacheKey);
  if (cached.hit) return cached.value;
  const stale = await readApiCache<unknown>(db, cacheKey, true);
  const lock = await acquireApiLock(db, { cacheKey, provider: "gmgn", endpoint, chain, address });
  if (!lock.acquired) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const filled = await readApiCache<unknown>(db, cacheKey);
      if (filled.hit) return filled.value;
    }
    if (stale.hit) return stale.value;
    throw new Error("GMGN token/info request is already in progress");
  }
  try {
    const value = await gmgnRequest(endpoint, { chain, address }, "token_enrichment");
    const negative = value === null || value === undefined || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);
    await storeApiCache(db, { cacheKey, provider: "gmgn", endpoint, chain, address, value, negative, ttlMs: negative ? 30 * 60_000 : 6 * 60 * 60_000, staleMs: negative ? 2 * 60 * 60_000 : 24 * 60 * 60_000, owner: lock.owner });
    return value;
  } catch (error) {
    await releaseApiLock(db, cacheKey, lock.owner);
    if (stale.hit) return stale.value;
    throw error;
  }
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function asList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  const list = record.list ?? record.data ?? record.items;
  return Array.isArray(list) ? list.map(asRecord) : [];
}

export function firstString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function firstNumber(record: JsonRecord, keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

