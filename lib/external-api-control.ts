export type ApiProvider = "okx" | "gmgn" | "market";
export type ApiTier = "basic" | "premium" | "free";

export type CachedApiValue<T> = { hit: boolean; negative: boolean; stale: boolean; value: T | null };

const LIMITS: Record<string, { daily: number; monthly: number }> = {
  "okx:premium": { daily: 90, monthly: 2_500 },
  "okx:basic": { daily: 3_000, monthly: 90_000 },
  "gmgn:basic": { daily: 2_500, monthly: 75_000 },
};

export class ApiBudgetExceededError extends Error {
  constructor(public readonly provider: ApiProvider, public readonly tier: ApiTier, public readonly period: "daily" | "monthly") {
    super(`${provider} ${tier} ${period} budget exhausted`);
    this.name = "ApiBudgetExceededError";
  }
}

export function tokenCacheKey(provider: ApiProvider, endpoint: string, chain: string, address: string) {
  return `${provider}:${endpoint}:${chain}:${chain === "sol" ? address : address.toLowerCase()}`;
}

export async function readApiCache<T>(db: D1Database | undefined, cacheKey: string, allowStale = false, now = new Date()): Promise<CachedApiValue<T>> {
  if (!db) return { hit: false, negative: false, stale: false, value: null };
  const row = await db.prepare("SELECT provider,payload_json,negative,expires_at,stale_until FROM external_api_cache WHERE cache_key=?").bind(cacheKey).first<{ provider: string; payload_json: string | null; negative: number; expires_at: string; stale_until: string }>().catch(() => null);
  if (!row) return { hit: false, negative: false, stale: false, value: null };
  const expired = Date.parse(row.expires_at) <= now.getTime();
  if (expired && (!allowStale || Date.parse(row.stale_until) <= now.getTime())) return { hit: false, negative: Boolean(row.negative), stale: false, value: null };
  if (row.provider !== "market") await db.prepare("UPDATE external_api_cache SET lookup_count=lookup_count+1,hit_count=hit_count+1,negative_hit_count=negative_hit_count+? WHERE cache_key=?").bind(row.negative ? 1 : 0, cacheKey).run().catch(() => undefined);
  try { return { hit: true, negative: Boolean(row.negative), stale: expired, value: row.payload_json ? JSON.parse(row.payload_json) as T : null }; }
  catch { return { hit: false, negative: Boolean(row.negative), stale: false, value: null }; }
}

export async function acquireApiLock(db: D1Database | undefined, input: { cacheKey: string; provider: ApiProvider; endpoint: string; chain: string; address: string }, now = new Date()) {
  if (!db) return { acquired: true, owner: "memory" };
  const owner = crypto.randomUUID();
  const expires = new Date(now.getTime() + 12_000).toISOString();
  const stale = new Date(now.getTime() - 1).toISOString();
  await db.prepare(`INSERT INTO external_api_cache (cache_key,provider,endpoint,chain,token_address,payload_json,negative,expires_at,stale_until,updated_at)
    VALUES (?,?,?,?,?,NULL,1,?,?,?) ON CONFLICT(cache_key) DO NOTHING`).bind(input.cacheKey, input.provider, input.endpoint, input.chain, input.address, stale, stale, now.toISOString()).run().catch(() => undefined);
  const result = await db.prepare("UPDATE external_api_cache SET lock_owner=?,lock_until=? WHERE cache_key=? AND (lock_until IS NULL OR lock_until<=?)").bind(owner, expires, input.cacheKey, now.toISOString()).run().catch(() => null);
  const acquired = Number(result?.meta.changes || 0) === 1;
  if (!acquired) await db.prepare("UPDATE external_api_cache SET coalesced_count=coalesced_count+1 WHERE cache_key=?").bind(input.cacheKey).run().catch(() => undefined);
  return { acquired, owner };
}

export async function storeApiCache(db: D1Database | undefined, input: { cacheKey: string; provider: ApiProvider; endpoint: string; chain: string; address: string; value: unknown; negative: boolean; ttlMs: number; staleMs: number; owner?: string }, now = new Date()) {
  if (!db) return;
  const payload = input.value === null || input.value === undefined ? null : JSON.stringify(input.value);
  await db.prepare(`INSERT INTO external_api_cache (cache_key,provider,endpoint,chain,token_address,payload_json,negative,expires_at,stale_until,lock_owner,lock_until,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,negative=excluded.negative,expires_at=excluded.expires_at,stale_until=excluded.stale_until,lock_owner=NULL,lock_until=NULL,updated_at=excluded.updated_at
    WHERE external_api_cache.lock_owner IS NULL OR external_api_cache.lock_owner=?`).bind(input.cacheKey, input.provider, input.endpoint, input.chain, input.address, payload, input.negative ? 1 : 0, new Date(now.getTime() + input.ttlMs).toISOString(), new Date(now.getTime() + input.staleMs).toISOString(), now.toISOString(), input.owner || null).run().catch(() => undefined);
}

export async function releaseApiLock(db: D1Database | undefined, cacheKey: string, owner: string) {
  if (!db || owner === "memory") return;
  await db.prepare("UPDATE external_api_cache SET lock_owner=NULL,lock_until=NULL WHERE cache_key=? AND lock_owner=?").bind(cacheKey, owner).run().catch(() => undefined);
}

export async function assertApiBudget(db: D1Database | undefined, provider: ApiProvider, tier: ApiTier, now = new Date()) {
  const limits = LIMITS[`${provider}:${tier}`];
  if (!db || !limits) return;
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const row = await db.prepare(`SELECT
    SUM(CASE WHEN substr(captured_at,1,10)=? THEN 1 ELSE 0 END) daily,
    SUM(CASE WHEN substr(captured_at,1,7)=? THEN 1 ELSE 0 END) monthly
    FROM external_api_usage WHERE provider=? AND tier=?`).bind(day, month, provider, tier).first<{ daily: number | null; monthly: number | null }>().catch(() => null);
  if (Number(row?.daily || 0) >= limits.daily) throw new ApiBudgetExceededError(provider, tier, "daily");
  if (Number(row?.monthly || 0) >= limits.monthly) throw new ApiBudgetExceededError(provider, tier, "monthly");
}

export async function recordExternalHttp(db: D1Database | undefined, input: { provider: ApiProvider; tier: ApiTier; endpoint: string; task: string; chain?: string; tokenCount?: number; status: string; httpStatus?: number; latencyMs: number; retryNumber: number; rateLimited?: boolean }, now = new Date()) {
  if (!db) return;
  await db.prepare(`INSERT INTO external_api_usage (request_id,provider,tier,endpoint,task,chain,token_count,status,http_status,latency_ms,retry_number,rate_limited,captured_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), input.provider, input.tier, input.endpoint, input.task, input.chain || "", Math.max(1, input.tokenCount || 1), input.status, input.httpStatus ?? null, Math.max(0, Math.round(input.latencyMs)), Math.max(0, input.retryNumber), input.rateLimited ? 1 : 0, now.toISOString()).run().catch(() => undefined);
}

export const API_BUDGETS = LIMITS;
