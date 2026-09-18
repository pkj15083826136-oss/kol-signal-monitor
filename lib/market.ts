import { env } from "cloudflare:workers";

type JsonRecord = Record<string, unknown>;

export type MarketData = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  price: number;
  marketCap: number;
  liquidity: number;
  holders: number;
  volume24h: number;
  pairAddress: string;
  dexUrl: string;
};

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type KlineResult = { candles: Candle[]; source: string; reason: string };

const emptyMarket: MarketData = { name: "", symbol: "", logo: "", description: "", price: 0, marketCap: 0, liquidity: 0, holders: 0, volume24h: 0, pairAddress: "", dexUrl: "" };
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
const geckoChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base" };
const aveChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function runtimeEnv(name: string): string { const value = (env as unknown as Record<string, unknown>)[name]; return typeof value === "string" ? value : ""; }

function bestPair(payload: unknown, address: string) {
  const pairs = Array.isArray(payload) ? payload.map(record) : [];
  const matching = pairs.filter((pair) => {
    const base = record(pair.baseToken);
    return string(base.address).toLowerCase() === address.toLowerCase();
  });
  return (matching.length ? matching : pairs).sort((a, b) => number(record(b.liquidity).usd) - number(record(a.liquidity).usd))[0] || {};
}

async function getDexMarket(chain: string, address: string): Promise<MarketData> {
  const chainId = dexChain[chain];
  if (!chainId) return emptyMarket;
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chainId}/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return emptyMarket;
  const pair = bestPair(await response.json(), address);
  const base = record(pair.baseToken);
  const info = record(pair.info);
  return {
    name: string(base.name), symbol: string(base.symbol), logo: string(info.imageUrl), description: "",
    price: number(pair.priceUsd), marketCap: number(pair.marketCap) || number(pair.fdv),
    liquidity: number(record(pair.liquidity).usd), holders: 0, volume24h: number(record(pair.volume).h24),
    pairAddress: string(pair.pairAddress), dexUrl: string(pair.url),
  };
}

async function getGmgnPublicMarket(chain: string, address: string): Promise<Partial<MarketData>> {
  try {
    const response = await fetch(`https://gmgn.ai/defi/quotation/v1/tokens/${chain}/${encodeURIComponent(address)}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return {};
    const root = record(await response.json());
    const data = record(root.data);
    const token = record(data.token ?? root.token ?? data);
    return {
      name: string(token.name), symbol: string(token.symbol), logo: string(token.logo),
      description: string(token.description) || string(token.desc) || string(token.bio),
      price: number(token.price) || number(token.price_usd),
      marketCap: number(token.market_cap) || number(token.marketcap) || number(token.fdv),
      liquidity: number(token.liquidity) || number(token.liquidity_usd),
      holders: number(token.holder_count) || number(token.holders),
      volume24h: number(token.volume_24h) || number(token.volume24h) || number(token.swap_volume_24h),
    };
  } catch { return {}; }
}

async function getAveMarket(chain: string, address: string): Promise<Partial<MarketData>> {
  const apiKey = runtimeEnv("AVE_API_KEY");
  const chainId = aveChain[chain];
  if (!apiKey || !chainId) return {};
  try {
    const tokenId = `${address}-${chainId}`;
    const response = await fetch(`https://prod.ave-api.com/v2/tokens/${encodeURIComponent(tokenId)}`, {
      headers: { Accept: "application/json", "X-API-KEY": apiKey }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return {};
    const root = record(await response.json());
    const data = record(root.data);
    const token = record(data.token);
    const pairs = Array.isArray(data.pairs) ? data.pairs.map(record) : [];
    const volume24h = Math.max(0, ...pairs.map((pair) => number(pair.volume_u)));
    return {
      name: string(token.name), symbol: string(token.symbol), logo: string(token.logo_url),
      description: string(token.description) || string(token.token_introduction) || string(token.introduction) || string(token.ai_description) || string(token.ai_intro) || string(token.project_intro),
      price: number(token.current_price_usd), marketCap: number(token.market_cap), liquidity: number(token.tvl),
      holders: number(token.holders), volume24h,
    };
  } catch { return {}; }
}

export async function getMarketData(chain: string, address: string): Promise<MarketData> {
  const [dex, gmgn, ave] = await Promise.all([
    getDexMarket(chain, address).catch(() => emptyMarket),
    getGmgnPublicMarket(chain, address),
    getAveMarket(chain, address),
  ]);
  return {
    name: ave.name || gmgn.name || dex.name, symbol: ave.symbol || gmgn.symbol || dex.symbol, logo: ave.logo || gmgn.logo || dex.logo,
    description: ave.description || gmgn.description || "", price: ave.price || gmgn.price || dex.price,
    marketCap: ave.marketCap || gmgn.marketCap || dex.marketCap, liquidity: ave.liquidity || gmgn.liquidity || dex.liquidity,
    holders: ave.holders || gmgn.holders || 0, volume24h: ave.volume24h || gmgn.volume24h || dex.volume24h,
    pairAddress: dex.pairAddress, dexUrl: dex.dexUrl,
  };
}

async function getAveKline(chain: string, address: string, interval: 5 | 15): Promise<Candle[]> {
  const apiKey = runtimeEnv("AVE_API_KEY");
  const chainId = aveChain[chain];
  if (!apiKey || !chainId) return [];
  const tokenId = `${address}-${chainId}`;
  const response = await fetch(`https://prod.ave-api.com/v2/klines/token/${encodeURIComponent(tokenId)}?interval=${interval}&limit=200`, {
    headers: { Accept: "application/json", "X-API-KEY": apiKey }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const root = record(await response.json());
  const points = record(root.data).points;
  if (!Array.isArray(points)) return [];
  return points.map(record).map((row) => ({ time: number(row.time), open: number(row.open), high: number(row.high), low: number(row.low), close: number(row.close), volume: number(row.volume) })).filter((row) => row.time && row.high && row.low).sort((a, b) => a.time - b.time);
}

async function getGeckoKline(chain: string, address: string): Promise<Candle[]> {
  const network = geckoChain[chain];
  if (!network) return [];
  const poolsResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${encodeURIComponent(address)}/pools?page=1`, {
    headers: { Accept: "application/json;version=20230302" }, signal: AbortSignal.timeout(8000),
  });
  if (!poolsResponse.ok) return [];
  const pools = record(await poolsResponse.json()).data;
  const rows = Array.isArray(pools) ? pools.map(record) : [];
  rows.sort((a, b) => number(record(b.attributes).reserve_in_usd) - number(record(a.attributes).reserve_in_usd));
  const poolAddress = string(record(rows[0]?.attributes).address);
  if (!poolAddress) return [];
  const candleResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${encodeURIComponent(poolAddress)}/ohlcv/minute?aggregate=5&limit=200&currency=usd`, {
    headers: { Accept: "application/json;version=20230302" }, signal: AbortSignal.timeout(8000),
  });
  if (!candleResponse.ok) return [];
  const list = record(record(await candleResponse.json()).data).attributes;
  const raw = record(list).ohlcv_list;
  if (!Array.isArray(raw)) return [];
  return raw.filter(Array.isArray).map((row) => ({ time: number(row[0]), open: number(row[1]), high: number(row[2]), low: number(row[3]), close: number(row[4]), volume: number(row[5]) })).sort((a, b) => a.time - b.time);
}

export async function getKlineData(chain: string, address: string): Promise<KlineResult> {
  const aveKey = runtimeEnv("AVE_API_KEY");
  const ave = await getAveKline(chain, address, 5).catch(() => []);
  if (ave.length) return { candles: ave, source: "Ave.ai · 5分钟", reason: "" };
  const gecko = await getGeckoKline(chain, address).catch(() => []);
  if (gecko.length) return { candles: gecko, source: "GeckoTerminal · 5分钟", reason: "" };
  return {
    candles: [], source: "",
    reason: aveKey ? "Ave.ai 与主流动池数据源均未返回该代币的K线，通常是尚未形成可索引交易池或链暂未被支持。" : "当前未配置 Ave.ai API 密钥，公共主流动池数据源也未返回该代币K线。配置 Ave.ai 后会自动优先读取5分钟K线。",
  };
}
