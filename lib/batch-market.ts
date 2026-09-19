import type { MarketData } from "@/lib/market";
import { resolveTokenMarket, tokenAddressEquals, type MarketCapKind, type MarketSource, type TokenMarketCandidate } from "@/lib/token-market";

type JsonRecord = Record<string, unknown>;
type DexPair = JsonRecord & { _requestedChain: string };
export type BatchMarketItem = Pick<MarketData, "price" | "marketCap" | "liquidity" | "holders" | "volume24h"> & Partial<Pick<MarketData, "marketDataConflict" | "marketCapCandidates" | "holderSource" | "holderUpdatedAt">> & { chain: string; address: string; updatedAt: string; source: string; marketCapKind?: MarketCapKind; marketCapSource?: MarketSource | null };
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

async function getAveBatch(tokens: Array<{ chain: string; address: string }>, updatedAt: string, apiKey = "") {
  if (!apiKey || !tokens.length) return new Map<string, TokenMarketCandidate>();
  try {
    const ids = tokens.map((token) => `${token.address}-${token.chain === "sol" ? "solana" : token.chain}`);
    const response = await fetch("https://prod.ave-api.com/v2/tokens/price", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-KEY": apiKey }, body: JSON.stringify({ token_ids: ids }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) return new Map();
    const root = record(await response.json());
    const data = record(root.data);
    const result = new Map<string, TokenMarketCandidate>();
    for (const token of tokens) {
      const chainId = token.chain === "sol" ? "solana" : token.chain;
      const tokenId = `${token.address}-${chainId}`;
      const row = record(data[tokenId]);
      if (!Object.keys(row).length) continue;
      const parsed: TokenMarketCandidate = { source: "ave", chain: token.chain, address: token.address, pairAddress: "", name: "", symbol: "", logo: "", description: "", price: number(row.current_price_usd) || null, marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: number(row.tvl) || null, volume24h: number(row.tx_volume_u_24h) || null, holderCount: null, createdAt: null, updatedAt, identityVerified: true };
      result.set(`${token.chain}:${token.address.toLowerCase()}`, parsed);
    }
    return result;
  } catch { return new Map(); }
}

export async function getBatchMarketData(tokens: Array<{ chain: string; address: string }>, apiKey = ""): Promise<BatchMarketItem[]> {
  const groups = new Map<string, string[]>();
  for (const token of tokens.slice(0, 30)) {
    if (!dexChain[token.chain] || !token.address) continue;
    const list = groups.get(token.chain) || [];
    if (!list.some((value) => value.toLowerCase() === token.address.toLowerCase())) list.push(token.address);
    groups.set(token.chain, list);
  }
  const updatedAt = new Date().toISOString();
  const [batches, ave] = await Promise.all([Promise.all([...groups].map(async ([chain, addresses]): Promise<DexPair[]> => {
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/${dexChain[chain]}/${addresses.map(encodeURIComponent).join(",")}`, { headers: { Accept: "application/json", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      return Array.isArray(payload) ? payload.map((item): DexPair => ({ ...record(item), _requestedChain: chain })) : [];
    } catch { return []; }
  })), getAveBatch(tokens.slice(0, 30), updatedAt, apiKey)]);
  const pairs = batches.flat();
  return tokens.slice(0, 30).map((token) => {
    const candidates = pairs.filter((pair) => pair._requestedChain === token.chain && tokenAddressEquals(token.chain, string(record(pair.baseToken).address), token.address));
    const pair = candidates.sort((a, b) => number(record(b.liquidity).usd) - number(record(a.liquidity).usd))[0] || {};
    const base = record(pair.baseToken);
    const dex: TokenMarketCandidate | null = Object.keys(pair).length ? { source: "dex", chain: token.chain, address: token.address, pairAddress: string(pair.pairAddress), name: string(base.name), symbol: string(base.symbol), logo: "", description: "", price: number(pair.priceUsd) || null, marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: number(record(pair.liquidity).usd) || null, volume24h: number(record(pair.volume).h24) || null, holderCount: null, createdAt: number(pair.pairCreatedAt) || null, updatedAt, identityVerified: tokenAddressEquals(token.chain, string(base.address), token.address) } : null;
    const aveItem = ave.get(`${token.chain}:${token.address.toLowerCase()}`);
    const resolved = resolveTokenMarket([aveItem, dex]);
    return { chain: token.chain, address: token.address, price: resolved.price ?? 0, marketCap: resolved.marketCap ?? 0, marketCapKind: resolved.marketCapKind, marketCapSource: resolved.marketCapSource, marketDataConflict: resolved.marketDataConflict, marketCapCandidates: resolved.marketCapCandidates, liquidity: resolved.liquidity ?? 0, holders: resolved.holderCount, holderSource: resolved.holderSource, holderUpdatedAt: resolved.holderUpdatedAt, volume24h: resolved.volume24h ?? 0, updatedAt, source: aveItem ? "Ave.ai" : dex ? "DexScreener" : "unavailable" };
  });
}
