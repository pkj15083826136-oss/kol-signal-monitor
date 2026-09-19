import { env } from "cloudflare:workers";
import { KLINE_META, type KlineInterval } from "@/lib/kline";
import { parseAveToken, parseGmgnToken, resolveTokenMarket, tokenAddressEquals, type MarketCapKind, type MarketSource, type TokenMarketCandidate } from "@/lib/token-market";

type JsonRecord = Record<string, unknown>;

export type MarketData = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  price: number;
  marketCap: number;
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
};

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type KlineResult = { candles: Candle[]; source: string; reason: string };

const emptyMarket: MarketData = { name: "", symbol: "", logo: "", description: "", price: 0, marketCap: 0, filterMarketCap: null, marketCapKind: null, marketCapSource: null, marketDataConflict: false, marketCapCandidates: {}, selectionReason: "market cap unavailable", liquidity: 0, holders: null, holderSource: null, holderUpdatedAt: null, volume24h: 0, pairAddress: "", dexUrl: "", createdAt: 0, identityVerified: false };
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
const geckoChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base" };
const aveChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function timestamp(value: unknown): number {
  const parsed = number(value);
  if (!parsed) return 0;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}
function runtimeEnv(name: string): string { const value = (env as unknown as Record<string, unknown>)[name]; return typeof value === "string" ? value : ""; }
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
    name: string(base.name), symbol: string(base.symbol), logo: string(info.imageUrl), description: "",
    price: number(pair.priceUsd), marketCap: number(pair.fdv), filterMarketCap: null, marketCapKind: number(pair.fdv) > 0 ? "fdv" : null, marketCapSource: number(pair.fdv) > 0 ? "dex" : null, marketDataConflict: false, marketCapCandidates: {}, selectionReason: "pair response provides FDV only",
    liquidity: number(record(pair.liquidity).usd), holders: null, holderSource: null, holderUpdatedAt: null, volume24h: number(record(pair.volume).h24),
    pairAddress: string(pair.pairAddress), dexUrl: string(pair.url), createdAt: timestamp(pair.pairCreatedAt),
    identityVerified: tokenAddressEquals(chain, string(base.address), address),
  };
}

async function getGmgnPublicMarket(chain: string, address: string): Promise<TokenMarketCandidate | null> {
  try {
    const response = await fetch(`https://gmgn.ai/defi/quotation/v1/tokens/${chain}/${encodeURIComponent(address)}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    return parseGmgnToken(await response.json(), chain, address);
  } catch { return null; }
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
  const useAve = options.useAve !== false;
  const [dex, gmgn, ave] = await Promise.all([
    getDexMarket(chain, address).catch(() => emptyMarket),
    getGmgnPublicMarket(chain, address),
    useAve ? getAveMarket(chain, address) : Promise.resolve<TokenMarketCandidate | null>(null),
  ]);
  const dexCandidate: TokenMarketCandidate = { source: "dex", chain, address, pairAddress: dex.pairAddress, name: dex.name, symbol: dex.symbol, logo: dex.logo, description: dex.description, price: dex.price || null, marketCap: null, fdv: dex.marketCap || null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: dex.liquidity || null, volume24h: dex.volume24h || null, holderCount: null, createdAt: dex.createdAt || null, updatedAt: new Date().toISOString(), identityVerified: dex.identityVerified };
  const resolved = resolveTokenMarket([ave, gmgn, dexCandidate]);
  return {
    // Token identity follows the contract's primary market metadata. Ave is a
    // fallback here because its token index can occasionally attach an alias
    // from a different project to the same contract (as seen with BONK).
    name: resolved.name, symbol: resolved.symbol, logo: resolved.logo, description: resolved.description, price: resolved.price ?? 0,
    marketCap: resolved.marketCap ?? 0, filterMarketCap: resolved.filterMarketCap, marketCapKind: resolved.marketCapKind, marketCapSource: resolved.marketCapSource,
    marketDataConflict: resolved.marketDataConflict, marketCapCandidates: resolved.marketCapCandidates, selectionReason: resolved.selectionReason,
    liquidity: resolved.liquidity ?? 0, holders: resolved.holderCount, holderSource: resolved.holderSource, holderUpdatedAt: resolved.holderUpdatedAt,
    volume24h: resolved.volume24h ?? 0, pairAddress: string(dex.pairAddress || resolved.pairAddress), dexUrl: string(dex.dexUrl), createdAt: resolved.createdAt ?? 0,
    identityVerified: resolved.identityVerified,
  };
}

async function getAveKline(chain: string, address: string, interval: KlineInterval): Promise<Candle[]> {
  const apiKey = runtimeEnv("AVE_API_KEY");
  const chainId = aveChain[chain];
  if (!apiKey || !chainId) return [];
  const tokenId = `${address}-${chainId}`;
  const response = await fetchWithRetry(`https://prod.ave-api.com/v2/klines/token/${encodeURIComponent(tokenId)}?interval=${interval}&limit=${KLINE_META[interval].limit}`, {
    headers: { Accept: "application/json", "X-API-KEY": apiKey, "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const root = record(await response.json());
  const points = record(root.data).points;
  if (!Array.isArray(points)) return [];
  return points.map(record).map((row) => ({ time: number(row.time), open: number(row.open), high: number(row.high), low: number(row.low), close: number(row.close), volume: number(row.volume) })).filter((row) => row.time && row.high && row.low).sort((a, b) => a.time - b.time);
}

async function getGeckoKline(chain: string, address: string, interval: KlineInterval): Promise<Candle[]> {
  const network = geckoChain[chain];
  if (!network) return [];
  const poolsResponse = await fetchWithRetry(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${encodeURIComponent(address)}/pools?page=1`, {
    headers: { Accept: "application/json;version=20230302", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
  });
  if (!poolsResponse.ok) return [];
  const pools = record(await poolsResponse.json()).data;
  const rows = Array.isArray(pools) ? pools.map(record) : [];
  rows.sort((a, b) => number(record(b.attributes).reserve_in_usd) - number(record(a.attributes).reserve_in_usd));
  const poolAddress = string(record(rows[0]?.attributes).address);
  if (!poolAddress) return [];
  const meta = KLINE_META[interval];
  const candleResponse = await fetchWithRetry(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${meta.geckoUnit}?aggregate=${meta.geckoAggregate}&limit=${meta.limit}&currency=usd`, {
    headers: { Accept: "application/json;version=20230302", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000),
  });
  if (!candleResponse.ok) return [];
  const list = record(record(await candleResponse.json()).data).attributes;
  const raw = record(list).ohlcv_list;
  if (!Array.isArray(raw)) return [];
  return raw.filter(Array.isArray).map((row) => ({ time: number(row[0]), open: number(row[1]), high: number(row[2]), low: number(row[3]), close: number(row[4]), volume: number(row[5]) })).sort((a, b) => a.time - b.time);
}

export async function getKlineData(chain: string, address: string, interval: KlineInterval = 15): Promise<KlineResult> {
  const aveKey = runtimeEnv("AVE_API_KEY");
  const ave = await getAveKline(chain, address, interval).catch(() => []);
  if (ave.length) return { candles: ave, source: `Ave.ai · ${KLINE_META[interval].label}`, reason: "" };
  const gecko = await getGeckoKline(chain, address, interval).catch(() => []);
  if (gecko.length) return { candles: gecko, source: `GeckoTerminal · ${KLINE_META[interval].label}`, reason: "" };
  return {
    candles: [], source: "",
    reason: aveKey ? `该链暂不支持此周期，或数据源尚未返回该代币的${KLINE_META[interval].label}K线。` : `该链暂不支持此周期，或当前公共数据源未返回${KLINE_META[interval].label}K线。`,
  };
}
