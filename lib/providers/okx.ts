import { tokenAddressEquals, type TokenMarketCandidate } from "@/lib/token-market";
import type { Candle } from "@/lib/market";
import type { KlineInterval } from "@/lib/kline";
import { acquireApiLock, assertApiBudget, readApiCache, recordExternalHttp, releaseApiLock, storeApiCache } from "@/lib/external-api-control";

type JsonRecord = Record<string, unknown>;
export type SupportedMarketChain = "sol" | "bsc" | "base" | "robinhood";
export type OkxCredentials = { apiKey: string; secretKey: string; passphrase: string; projectId: string };
export type OkxErrorKind = "configuration" | "authentication" | "rate_limited" | "timeout" | "upstream" | "invalid_response" | "circuit_open";
export type OkxRequestMeta = { requestCount: number; latencyMs: number; cacheHit: boolean; rateLimited: boolean; status: "healthy" | "rate_limited" | "degraded" | "unavailable" };
export type OkxResult<T> = { value: T; meta: OkxRequestMeta };

export const OKX_CHAIN_INDEX: Record<SupportedMarketChain, string> = { sol: "501", bsc: "56", base: "8453", robinhood: "4663" };
export const OKX_KLINE_BAR: Record<KlineInterval, string> = { 1: "1m", 5: "5m", 15: "15m", 60: "1H", 240: "4H", 1440: "1Dutc" };

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function finite(value: unknown, allowZero = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : null;
}
function signed(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function cacheAddress(chain: string, address: string) { return chain === "sol" ? address : address.toLowerCase(); }
function key(chain: string, address: string) { return `${chain}:${cacheAddress(chain, address)}`; }
function base64(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }

export class OkxRequestError extends Error {
  constructor(public readonly kind: OkxErrorKind, message: string, public readonly status = 0) { super(message); this.name = "OkxRequestError"; }
}

export async function signOkxRequest(secretKey: string, timestamp: string, method: string, requestPathWithQuery: string, body = "") {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${timestamp}${method.toUpperCase()}${requestPathWithQuery}${body}`)));
}

export async function okxHeaders(credentials: OkxCredentials, timestamp: string, method: string, requestPathWithQuery: string, body = "") {
  return {
    Accept: "application/json", "Content-Type": "application/json",
    "OK-ACCESS-KEY": credentials.apiKey,
    "OK-ACCESS-SIGN": await signOkxRequest(credentials.secretKey, timestamp, method, requestPathWithQuery, body),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": credentials.passphrase,
    "OK-ACCESS-PROJECT": credentials.projectId,
  };
}

export function okxCredentialsFromEnv(runtime: Record<string, unknown>): OkxCredentials | null {
  const values = ["OKX_WEB3_API_KEY", "OKX_WEB3_SECRET_KEY", "OKX_WEB3_PASSPHRASE", "OKX_WEB3_PROJECT_ID"].map((name) => typeof runtime[name] === "string" ? String(runtime[name]) : "");
  return values.every(Boolean) ? { apiKey: values[0], secretKey: values[1], passphrase: values[2], projectId: values[3] } : null;
}

export function parseOkxPriceInfo(payload: unknown, requested: Array<{ chain: string; address: string }>, now = new Date().toISOString()) {
  const root = record(payload); if (String(root.code) !== "0" || !Array.isArray(root.data)) return new Map<string, TokenMarketCandidate>();
  const wanted = new Map(requested.map((token) => [key(token.chain, token.address), token]));
  const result = new Map<string, TokenMarketCandidate>();
  for (const raw of root.data) {
    const row = record(raw); const chainIndex = text(row.chainIndex); const address = text(row.tokenContractAddress ?? row.tokenAddress);
    const requestedToken = requested.find((token) => OKX_CHAIN_INDEX[token.chain as SupportedMarketChain] === chainIndex && tokenAddressEquals(token.chain, address, token.address));
    if (!requestedToken || !wanted.has(key(requestedToken.chain, requestedToken.address))) continue;
    const stamp = finite(row.time, true); const updatedAt = stamp ? new Date(stamp).toISOString() : now;
    result.set(key(requestedToken.chain, requestedToken.address), {
      source: "okx", chain: requestedToken.chain, address, pairAddress: "", name: "", symbol: "", logo: "", description: "", descriptionSource: null,
      price: finite(row.price), priceChange24h: signed(row.priceChange24H ?? row.priceChange24h), marketCap: finite(row.marketCap), fdv: finite(row.fdv),
      circulatingSupply: finite(row.circSupply ?? row.circulatingSupply), totalSupply: finite(row.totalSupply), decimals: finite(row.decimals, true),
      liquidity: finite(row.liquidity), volume24h: finite(row.volume24H ?? row.volume24h), holderCount: finite(row.holders, true), createdAt: null,
      updatedAt, identityVerified: true,
    });
  }
  return result;
}

export function parseOkxCandles(payload: unknown): Candle[] {
  const root = record(payload); if (String(root.code) !== "0" || !Array.isArray(root.data)) return [];
  const rows = new Map<number, Candle>();
  for (const raw of root.data) {
    if (!Array.isArray(raw)) continue;
    const ms = finite(raw[0]); const open = finite(raw[1]); const high = finite(raw[2]); const low = finite(raw[3]); const close = finite(raw[4]); const volume = finite(raw[5], true);
    if (ms === null || open === null || high === null || low === null || close === null || volume === null) continue;
    rows.set(Math.floor(ms / 1000), { time: Math.floor(ms / 1000), open, high, low, close, volume });
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

export function parseOkxTokenSearch(payload: unknown): JsonRecord[] {
  const root = record(payload);
  if (String(root.code) !== "0" || !Array.isArray(root.data)) return [];
  return root.data.map(record).filter((row) => Object.keys(row).length > 0);
}

type ClientOptions = { fetcher?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; db?: D1Database; task?: string };
type Cached = { expiresAt: number; staleUntil: number; value: unknown };

export class OkxMarketClient {
  private readonly fetcher: typeof fetch; private readonly now: () => number; private readonly sleep: (ms: number) => Promise<void>;
  private readonly db: D1Database | undefined; private readonly task: string;
  private readonly cache = new Map<string, Cached>(); private readonly pending = new Map<string, Promise<OkxResult<unknown>>>();
  private activeRequests = 0; private readonly requestWaiters: Array<() => void> = [];
  private circuitOpenUntil = 0;
  constructor(private readonly credentials: OkxCredentials, options: ClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch; this.now = options.now ?? Date.now; this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.db = options.db; this.task = options.task || "market_adapter";
  }

  private async withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeRequests >= 4) await new Promise<void>((resolve) => this.requestWaiters.push(resolve));
    this.activeRequests += 1;
    try { return await task(); }
    finally { this.activeRequests -= 1; this.requestWaiters.shift()?.(); }
  }

  private async request<T>(cacheKey: string, method: "GET" | "POST", pathWithQuery: string, body: string, ttlMs: number, parse: (payload: unknown) => T, context: { tier: "basic" | "premium"; endpoint: string; chain?: string; address?: string; tokenCount?: number }): Promise<OkxResult<T>> {
    const cached = this.cache.get(cacheKey); if (cached && cached.expiresAt > this.now()) return { value: cached.value as T, meta: { requestCount: 0, latencyMs: 0, cacheHit: true, rateLimited: false, status: "healthy" } };
    const existing = this.pending.get(cacheKey); if (existing) return existing as Promise<OkxResult<T>>;
    if (this.circuitOpenUntil > this.now()) throw new OkxRequestError("circuit_open", "OKX market circuit is temporarily open");
    const promise = (async () => {
      const persistentKey = `okx:${cacheKey}`;
      const persisted = await readApiCache<unknown>(this.db, persistentKey);
      if (persisted.hit) {
        const value = parse(persisted.value); this.cache.set(cacheKey, { expiresAt: this.now() + ttlMs, staleUntil: this.now() + Math.max(ttlMs * 20, 5 * 60_000), value });
        return { value, meta: { requestCount: 0, latencyMs: 0, cacheHit: true, rateLimited: false, status: "healthy" as const } };
      }
      const stale = await readApiCache<unknown>(this.db, persistentKey, true);
      const lock = await acquireApiLock(this.db, { cacheKey: persistentKey, provider: "okx", endpoint: context.endpoint, chain: context.chain || "", address: context.address || "batch" });
      if (!lock.acquired) {
        for (let wait = 0; wait < 6; wait += 1) { await this.sleep(250); const filled = await readApiCache<unknown>(this.db, persistentKey); if (filled.hit) return { value: parse(filled.value), meta: { requestCount: 0, latencyMs: 0, cacheHit: true, rateLimited: false, status: "healthy" as const } }; }
        if (stale.hit) return { value: parse(stale.value), meta: { requestCount: 0, latencyMs: 0, cacheHit: true, rateLimited: false, status: "degraded" as const } };
        throw new OkxRequestError("circuit_open", "OKX equivalent request is already in progress");
      }
      const started = this.now(); let requests = 0; let lastStatus = 0;
      try { for (let attempt = 0; attempt < 2; attempt += 1) {
        await assertApiBudget(this.db, "okx", context.tier, new Date(this.now()));
        requests += 1; let responseRecorded = false; const timestamp = new Date(this.now()).toISOString(); const headers = await okxHeaders(this.credentials, timestamp, method, pathWithQuery, body);
        try {
          const response = await this.withRequestSlot(() => this.fetcher(`https://web3.okx.com${pathWithQuery}`, { method, headers, body: method === "POST" ? body : undefined, signal: AbortSignal.timeout(8000) }));
          lastStatus = response.status;
          await recordExternalHttp(this.db, { provider: "okx", tier: context.tier, endpoint: context.endpoint, task: this.task, chain: context.chain, tokenCount: context.tokenCount, status: response.ok ? "success" : "http_error", httpStatus: response.status, latencyMs: this.now() - started, retryNumber: attempt, rateLimited: response.status === 429 }, new Date(this.now()));
          responseRecorded = true;
          if (response.status === 429) { if (attempt === 0) { await this.sleep(250); continue; } this.circuitOpenUntil = this.now() + 30_000; throw new OkxRequestError("rate_limited", "OKX market rate limited", 429); }
          if (!response.ok) { if (response.status >= 500 && attempt === 0) { await this.sleep(250); continue; } throw new OkxRequestError(response.status === 401 || response.status === 403 ? "authentication" : "upstream", "OKX market request failed", response.status); }
          const payload = await response.json(); const root = record(payload);
          if (String(root.code) !== "0") {
            const kind = String(root.code) === "50011" ? "rate_limited" : "upstream";
            if (attempt === 0) { await this.sleep(250 + Math.floor(Math.random() * 100)); continue; }
            if (kind === "rate_limited") this.circuitOpenUntil = this.now() + 30_000;
            throw new OkxRequestError(kind, `OKX market business error ${String(root.code)}`);
          }
          const value = parse(payload); this.cache.set(cacheKey, { expiresAt: this.now() + ttlMs, staleUntil: this.now() + Math.max(ttlMs * 20, 5 * 60_000), value });
          await storeApiCache(this.db, { cacheKey: persistentKey, provider: "okx", endpoint: context.endpoint, chain: context.chain || "", address: context.address || "batch", value: payload, negative: Array.isArray(record(payload).data) && (record(payload).data as unknown[]).length === 0, ttlMs, staleMs: Math.max(ttlMs * 20, 5 * 60_000), owner: lock.owner }, new Date(this.now()));
          return { value, meta: { requestCount: requests, latencyMs: Math.max(0, this.now() - started), cacheHit: false, rateLimited: false, status: "healthy" as const } };
        } catch (error) {
          if (error instanceof OkxRequestError) {
            if (cached && cached.staleUntil > this.now()) return { value: cached.value as T, meta: { requestCount: requests, latencyMs: Math.max(0, this.now() - started), cacheHit: true, rateLimited: error.kind === "rate_limited", status: "degraded" as const } };
            throw error;
          }
          if (!responseRecorded) await recordExternalHttp(this.db, { provider: "okx", tier: context.tier, endpoint: context.endpoint, task: this.task, chain: context.chain, tokenCount: context.tokenCount, status: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network_error", latencyMs: this.now() - started, retryNumber: attempt }, new Date(this.now()));
          if (attempt === 0) { await this.sleep(250 + Math.floor(Math.random() * 100)); continue; }
          if (cached && cached.staleUntil > this.now()) return { value: cached.value as T, meta: { requestCount: requests, latencyMs: Math.max(0, this.now() - started), cacheHit: true, rateLimited: false, status: "degraded" as const } };
          throw new OkxRequestError(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "upstream", "OKX market request failed", lastStatus);
        }
      }} finally { await releaseApiLock(this.db, persistentKey, lock.owner); }
      throw new OkxRequestError("upstream", "OKX market request failed", lastStatus);
    })() as Promise<OkxResult<unknown>>;
    this.pending.set(cacheKey, promise);
    try { return await promise as OkxResult<T>; } finally { this.pending.delete(cacheKey); }
  }

  priceInfo(tokens: Array<{ chain: string; address: string }>) {
    const normalized = tokens.filter((token): token is { chain: SupportedMarketChain; address: string } => token.chain in OKX_CHAIN_INDEX && Boolean(token.address)).map((token) => ({ chain: token.chain, address: token.address, chainIndex: OKX_CHAIN_INDEX[token.chain], tokenContractAddress: cacheAddress(token.chain, token.address) }));
    const body = JSON.stringify(normalized.map(({ chainIndex, tokenContractAddress }) => ({ chainIndex, tokenContractAddress })));
    const cacheKey = `price:${normalized.map((token) => `${token.chainIndex}:${token.tokenContractAddress}`).join(",")}`;
    return this.request(cacheKey, "POST", "/api/v6/dex/market/price-info", body, 60_000, (payload) => parseOkxPriceInfo(payload, normalized), { tier: "premium", endpoint: "/api/v6/dex/market/price-info", tokenCount: normalized.length });
  }

  tokenSearch(chain: SupportedMarketChain, address: string) {
    const normalized = cacheAddress(chain, address);
    const query = new URLSearchParams({ chains: OKX_CHAIN_INDEX[chain], search: normalized, limit: "10" });
    const path = `/api/v6/dex/market/token/search?${query.toString()}`;
    return this.request(`token-search:${chain}:${normalized}`, "GET", path, "", 6 * 60 * 60_000, parseOkxTokenSearch, { tier: "basic", endpoint: "/api/v6/dex/market/token/search", chain, address: normalized, tokenCount: 1 });
  }

  candles(chain: SupportedMarketChain, address: string, interval: KlineInterval, limit: number) {
    const total = Math.min(500, Math.max(2, limit));
    const page = (pageLimit: number, after?: number) => {
      const query = new URLSearchParams({ chainIndex: OKX_CHAIN_INDEX[chain], tokenContractAddress: cacheAddress(chain, address), bar: OKX_KLINE_BAR[interval], limit: String(Math.min(299, pageLimit)) });
      if (after) query.set("after", String(after));
      const path = `/api/v6/dex/market/candles?${query.toString()}`;
      return this.request(`okx:candles:${chain}:${cacheAddress(chain, address)}:${interval}:${pageLimit}:${after || "latest"}`, "GET", path, "", total <= 5 ? 15_000 : 5 * 60_000, parseOkxCandles, { tier: "basic", endpoint: "/api/v6/dex/market/candles", chain, address, tokenCount: 1 });
    };
    return (async (): Promise<OkxResult<Candle[]>> => {
      const first = await page(Math.min(299, total));
      if (total <= 299 || first.value.length < Math.min(299, total)) return first;
      const oldest = first.value[0]?.time;
      if (!oldest) return first;
      const second = await page(total - first.value.length, oldest * 1000);
      const merged = new Map<number, Candle>();
      for (const candle of [...second.value, ...first.value]) merged.set(candle.time, candle);
      return {
        value: [...merged.values()].sort((a, b) => a.time - b.time).slice(-total),
        meta: {
          requestCount: first.meta.requestCount + second.meta.requestCount,
          latencyMs: first.meta.latencyMs + second.meta.latencyMs,
          cacheHit: first.meta.cacheHit && second.meta.cacheHit,
          rateLimited: first.meta.rateLimited || second.meta.rateLimited,
          status: first.meta.status === "healthy" && second.meta.status === "healthy" ? "healthy" : "degraded",
        },
      };
    })();
  }
}
