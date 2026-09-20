import { env } from "cloudflare:workers";
import { KLINE_META, klineUnavailableReason, type KlineInterval } from "@/lib/kline";
import { parseAveToken, parseGmgnToken, resolveTokenMarket, tokenAddressEquals, type MarketCapKind, type MarketSource, type TokenMarketCandidate } from "@/lib/token-market";
import { canRequest, nextBackoff, type BackoffState } from "@/lib/source-backoff";
import { OKX_CHAIN_INDEX, OkxMarketClient, OkxRequestError, okxCredentialsFromEnv, type OkxRequestMeta, type SupportedMarketChain } from "@/lib/providers/okx";
import { getTokenInfo as getGmgnTokenInfo } from "@/lib/gmgn";

type JsonRecord = Record<string, unknown>;

export type MarketData = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  descriptionSource: string | null;
  descriptionUpdatedAt: string | null;
  website: string;
  socials: Record<string, string>;
  price: number;
  priceChange24h: number | null;
  change24hSource: MarketSource | null;
  change24hUpdatedAt: string | null;
  marketCap: number;
  fdv: number | null;
  filterMarketCap: number | null;
  marketCapKind: MarketCapKind;
  marketCapSource: MarketSource | null;
  marketDataConflict: boolean;
  marketCapCandidates: Partial<Record<MarketSource, number>>;
  selectionReason: string;
  liquidity: number;
  holders: number | null;
  holderSource: MarketSource | null;
  holderUpdatedAt: string | null;
  volume24h: number;
  pairAddress: string;
  dexUrl: string;
  createdAt: number;
  identityVerified: boolean;
  sourceStatus: Partial<Record<MarketSource, "healthy" | "rate_limited" | "degraded" | "unavailable">>;
};

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type KlineFailureKind = "unsupported" | "unindexed" | "timeout" | "upstream";
export type KlineResult = { candles: Candle[]; source: string; reason: string; failureKind?: KlineFailureKind; providerMeta?: OkxRequestMeta };

const emptyMarket: MarketData = { name: "", symbol: "", logo: "", description: "", descriptionSource: null, descriptionUpdatedAt: null, website: "", socials: {}, price: 0, priceChange24h: null, change24hSource: null, change24hUpdatedAt: null, marketCap: 0, fdv: null, filterMarketCap: null, marketCapKind: null, marketCapSource: null, marketDataConflict: false, marketCapCandidates: {}, selectionReason: "market cap unavailable", liquidity: 0, holders: null, holderSource: null, holderUpdatedAt: null, volume24h: 0, pairAddress: "", dexUrl: "", createdAt: 0, identityVerified: false, sourceStatus: {} };
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
const geckoChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base" };
const aveChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
const geckoPoolCache = new Map<string, { address: string; expiresAt: number }>();
let gmgnBackoff: BackoffState | undefined;
let okxClient: OkxMarketClient | undefined;

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function timestamp(value: unknown): number {
  const parsed = number(value);
  if (!parsed) return 0;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}
function runtimeEnv(name: string): string { const value = (env as unknown as Record<string, unknown>)[name]; return typeof value === "string" ? value : ""; }
function getOkxClient() {
  const credentials = okxCredentialsFromEnv(env as unknown as Record<string, unknown>);
  if (!credentials) return undefined;
  okxClient ??= new OkxMarketClient(credentials);
  return okxClient;
}
async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let response: Response | undefined;
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(url, init);
      if (response.ok || response.status < 429) return response;
    } catch (caught) { error = caught; }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (response) return response;
  throw error instanceof Error ? error : new Error("行情数据源请求失败");
}

function bestPair(payload: unknown, chain: string, address: string) {
  const pairs = Array.isArray(payload) ? payload.map(record) : [];
  const matching = pairs.filter((pair) => {
    const base = record(pair.baseToken);
    return tokenAddressEquals(chain, string(base.address), address);
  });
  return (matching.length ? matching : pairs).sort((a, b) => number(record(b.liquidity).usd) - number(record(a.liquidity).usd))[0] || {};
}

async function getDexMarket(chain: string, address: string): Promise<MarketData> {
  const chainId = dexChain[chain];
  if (!chainId) return emptyMarket;
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chainId}/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return emptyMarket;
  const pair = bestPair(await response.json(), chain, address);
  const base = record(pair.baseToken);
  const info = record(pair.info);
  return {
    name: string(base.name), symbol: string(base.symbol), logo: string(info.imageUrl), description: "", descriptionSource: null, descriptionUpdatedAt: null, website: "", socials: {},
    price: number(pair.priceUsd), priceChange24h: Number.isFinite(Number(record(pair.priceChange).h24)) ? Number(record(pair.priceChange).h24) : null, change24hSource: "dex", change24hUpdatedAt: new Date().toISOString(), marketCap: 0, fdv: number(pair.fdv) || null, filterMarketCap: null, marketCapKind: null, marketCapSource: null, marketDataConflict: false, marketCapCandidates: {}, selectionReason: "pair response provides FDV only; FDV is not market cap",
    liquidity: number(record(pair.liquidity).usd), holders: null, holderSource: null, holderUpdatedAt: null, volume24h: number(record(pair.volume).h24),
    pairAddress: string(pair.pairAddress), dexUrl: string(pair.url), createdAt: timestamp(pair.pairCreatedAt),
    identityVerified: tokenAddressEquals(chain, string(base.address), address), sourceStatus: {},
  };
}

async function getGmgnMarket(chain: string, address: string): Promise<TokenMarketCandidate | null> {
  if (!canRequest(gmgnBackoff, Date.now())) return null;
  try {
    const payload = await getGmgnTokenInfo(chain, address);
    gmgnBackoff = undefined;
    return parseGmgnToken({ data: payload }, chain, address);
  } catch (error) { gmgnBackoff = nextBackoff(gmgnBackoff, Date.now(), /429|rate/i.test(error instanceof Error ? error.message : ""), Math.floor(Math.random() * 1000)); return null; }
}

async function getAveMarket(chain: string, address: string): Promise<TokenMarketCandidate | null> {
  const apiKey = runtimeEnv("AVE_API_KEY");
  const chainId = aveChain[chain];
  if (!apiKey || !chainId) return null;
  try {
    const tokenId = `${address}-${chainId}`;
    const response = await fetch(`https://prod.ave-api.com/v2/tokens/${encodeURIComponent(tokenId)}`, {
      headers: { Accept: "application/json", "X-API-KEY": apiKey }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return parseAveToken(await response.json(), chain, address);
  } catch { return null; }
}

export async function getMarketData(chain: string, address: string, options: { useAve?: boolean } = {}): Promise<MarketData> {
  // Ave is opt-in shadow sampling only. Public pages and polling must never
  // consume its quota or rely on it for production fields.
  const useAve = options.useAve === true;
  const [dex, gmgn, okx, ave] = await Promise.all([
    getDexMarket(chain, address).catch(() => emptyMarket),
    getGmgnMarket(chain, address),
    getOkxClient()?.priceInfo([{ chain, address }]).then((result) => result.value.get(`${chain}:${chain === "sol" ? address : address.toLowerCase()}`) ?? null).catch(() => null) ?? Promise.resolve(null),
    useAve ? getAveMarket(chain, address) : Promise.resolve<TokenMarketCandidate | null>(null),
  ]);
  const dexCandidate: TokenMarketCandidate = { source: "dex", chain, address, pairAddress: dex.pairAddress, name: dex.name, symbol: dex.symbol, logo: dex.logo, description: dex.description, descriptionSource: null, price: dex.price || null, priceChange24h: dex.priceChange24h, marketCap: null, fdv: dex.fdv, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: dex.liquidity || null, volume24h: dex.volume24h || null, holderCount: null, createdAt: dex.createdAt || null, updatedAt: new Date().toISOString(), identityVerified: dex.identityVerified };
  // Ave is sampled for health during the transition, but does not participate
  // in production field selection. This keeps it a true shadow source.
  const resolved = resolveTokenMarket([okx, gmgn, dexCandidate]);
  return {
    // Token identity and fields come only from the verified production
    // providers above. The optional Ave result is health-only shadow evidence.
    name: resolved.name, symbol: resolved.symbol, logo: resolved.logo, description: resolved.description, descriptionSource: resolved.descriptionSource, descriptionUpdatedAt: resolved.descriptionUpdatedAt, website: resolved.website, socials: resolved.socials, price: resolved.price ?? 0, priceChange24h: resolved.priceChange24h, change24hSource: resolved.change24hSource, change24hUpdatedAt: resolved.change24hUpdatedAt,
    marketCap: resolved.marketCap ?? 0, fdv: resolved.fdv, filterMarketCap: resolved.filterMarketCap, marketCapKind: resolved.marketCapKind, marketCapSource: resolved.marketCapSource,
    marketDataConflict: resolved.marketDataConflict, marketCapCandidates: resolved.marketCapCandidates, selectionReason: resolved.selectionReason,
    liquidity: resolved.liquidity ?? 0, holders: resolved.holderCount, holderSource: resolved.holderSource, holderUpdatedAt: resolved.holderUpdatedAt,
    volume24h: resolved.volume24h ?? 0, pairAddress: string(dex.pairAddress || resolved.pairAddress), dexUrl: string(dex.dexUrl), createdAt: resolved.createdAt ?? 0,
    identityVerified: resolved.identityVerified,
    sourceStatus: { okx: okx?.identityVerified ? "healthy" : getOkxClient() ? "unavailable" : "unavailable", ...(useAve ? { ave: ave?.identityVerified ? "healthy" as const : "unavailable" as const } : {}), gmgn: gmgn?.identityVerified ? "healthy" : gmgnBackoff ? "rate_limited" : "unavailable", dex: dex.identityVerified ? "healthy" : "unavailable" },
  };
}

type KlineAttempt = { candles: Candle[]; failureKind?: KlineFailureKind };

async function getGeckoKline(chain: string, address: string, interval: KlineInterval, limit: number): Promise<KlineAttempt> {
  const network = geckoChain[chain];
  if (!network) return { candles: [], failureKind: "unsupported" };
  const key = `${chain}:${chain === "sol" ? address : address.toLowerCase()}`;
  const cached = geckoPoolCache.get(key);
  let poolAddress = cached && cached.expiresAt > Date.now() ? cached.address : "";
  if (!poolAddress) {
    const poolsResponse = await fetchWithRetry(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${encodeURIComponent(address)}/pools?page=1`, {
      headers: { Accept: "application/json;version=20230302", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
    });
    if (!poolsResponse.ok) return { candles: [], failureKind: poolsResponse.status === 404 ? "unindexed" : "upstream" };
    const pools = record(await poolsResponse.json()).data;
    const rows = Array.isArray(pools) ? pools.map(record) : [];
    rows.sort((a, b) => number(record(b.attributes).reserve_in_usd) - number(record(a.attributes).reserve_in_usd));
    poolAddress = string(record(rows[0]?.attributes).address);
    if (poolAddress) geckoPoolCache.set(key, { address: poolAddress, expiresAt: Date.now() + 5 * 60_000 });
  }
  if (!poolAddress) return { candles: [], failureKind: "unindexed" };
  const meta = KLINE_META[interval];
  const candleResponse = await fetchWithRetry(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${meta.geckoUnit}?aggregate=${meta.geckoAggregate}&limit=${limit}&currency=usd`, {
    headers: { Accept: "application/json;version=20230302", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
  });
  if (!candleResponse.ok) return { candles: [], failureKind: candleResponse.status === 404 ? "unindexed" : "upstream" };
  const list = record(record(await candleResponse.json()).data).attributes;
  const raw = record(list).ohlcv_list;
  if (!Array.isArray(raw)) return { candles: [], failureKind: "unindexed" };
  const candles = raw.filter(Array.isArray).map((row) => ({ time: number(row[0]), open: number(row[1]), high: number(row[2]), low: number(row[3]), close: number(row[4]), volume: number(row[5]) })).sort((a, b) => a.time - b.time);
  return { candles, failureKind: candles.length ? undefined : "unindexed" };
}

export async function getKlineData(chain: string, address: string, interval: KlineInterval = 15, requestedLimit?: number): Promise<KlineResult> {
  const limit = Math.max(2, Math.min(requestedLimit ?? KLINE_META[interval].limit, KLINE_META[interval].limit));
  const classify = (error: unknown): KlineAttempt => ({ candles: [], failureKind: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : /timeout/i.test(error instanceof Error ? error.message : "") ? "timeout" : "upstream" });
  const okxOutcome = await (getOkxClient() && chain in OKX_CHAIN_INDEX
    ? getOkxClient()!.candles(chain as SupportedMarketChain, address, interval, limit).then((result) => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }))
    : Promise.resolve({ result: null, error: new OkxRequestError("configuration", "OKX market is not configured") }));
  const okxResult = okxOutcome.result;
  const okxFailureMeta: OkxRequestMeta | undefined = okxOutcome.error ? { requestCount: 1, latencyMs: 0, cacheHit: false, rateLimited: okxOutcome.error instanceof OkxRequestError && okxOutcome.error.kind === "rate_limited", status: okxOutcome.error instanceof OkxRequestError && okxOutcome.error.kind === "rate_limited" ? "rate_limited" : "unavailable" } : undefined;
  const okx: KlineAttempt = okxResult ? { candles: okxResult.value } : { candles: [], failureKind: okxOutcome.error instanceof OkxRequestError && okxOutcome.error.kind === "timeout" ? "timeout" : okxOutcome.error instanceof OkxRequestError && okxOutcome.error.kind === "configuration" ? "unsupported" : "upstream" };
  if (okx.candles.length) return { candles: okx.candles, source: `OKX Onchain · ${KLINE_META[interval].label}`, reason: "", providerMeta: okxResult?.meta };
  const gecko = await getGeckoKline(chain, address, interval, limit).catch(classify);
  if (gecko.candles.length) return { candles: gecko.candles, source: `GeckoTerminal · ${KLINE_META[interval].label}`, reason: "", providerMeta: okxFailureMeta };
  const failureKind: KlineFailureKind = [okx.failureKind, gecko.failureKind].includes("timeout") ? "timeout" : [okx.failureKind, gecko.failureKind].includes("upstream") ? "upstream" : [okx.failureKind, gecko.failureKind].every((kind) => kind === "unsupported") ? "unsupported" : "unindexed";
  return {
    candles: [], source: "",
    reason: klineUnavailableReason(chain, interval, failureKind), failureKind, providerMeta: okxFailureMeta,
  };
}
