import type { MarketData } from "@/lib/market";
import { resolveTokenMarket, tokenAddressEquals, type MarketCapKind, type MarketSource, type TokenMarketCandidate } from "@/lib/token-market";

type JsonRecord = Record<string, unknown>;
type DexPair = JsonRecord & { _requestedChain: string };
export type SnapshotField = "price" | "priceChange24h" | "marketCap" | "liquidity" | "volume24h" | "holders";
export type BatchMarketItem = Pick<MarketData, "price" | "priceChange24h" | "marketCap" | "liquidity" | "holders" | "volume24h"> & Partial<Pick<MarketData, "marketDataConflict" | "marketCapCandidates" | "holderSource" | "holderUpdatedAt" | "change24hSource" | "change24hUpdatedAt">> & {
  chain: string; address: string; tokenAddress: string; pairAddress: string; symbol: string; decimals: number | null;
  updatedAt: string; sourceTimestamp: string; receivedAt: string; source: string; identityVerified: boolean;
  marketCapKind?: MarketCapKind; marketCapSource?: MarketSource | null;
  fieldSources: Partial<Record<SnapshotField, string>>; fieldUpdatedAt: Partial<Record<SnapshotField, string>>;
  staleFields: SnapshotField[]; conflictFields: SnapshotField[];
};
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
      const returnedAddress = string(row.token ?? row.address ?? row.token_address) || token.address;
      const returnedChain = string(row.chain ?? row.chain_id ?? row.network);
      const identityVerified = tokenAddressEquals(token.chain, returnedAddress, token.address) && (!returnedChain || [token.chain, chainId].includes(returnedChain.toLowerCase()));
      const change = row.price_change_24h ?? row.price_change_24h_percent ?? row.price_change_percent_24h;
      const parsed: TokenMarketCandidate = { source: "ave", chain: token.chain, address: returnedAddress, pairAddress: string(row.main_pair), name: string(row.name), symbol: string(row.symbol), logo: "", description: "", descriptionSource: null, price: number(row.current_price_usd) || null, priceChange24h: change === null || change === undefined || change === "" || !Number.isFinite(Number(change)) ? null : Number(change), marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: Number.isFinite(Number(row.decimals ?? row.decimal)) ? Number(row.decimals ?? row.decimal) : null, liquidity: number(row.tvl) || null, volume24h: number(row.tx_volume_u_24h) || null, holderCount: null, createdAt: null, updatedAt, identityVerified };
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
    const dexChange = record(pair.priceChange).h24;
    const dex: TokenMarketCandidate | null = Object.keys(pair).length ? { source: "dex", chain: token.chain, address: string(base.address), pairAddress: string(pair.pairAddress), name: string(base.name), symbol: string(base.symbol), logo: "", description: "", descriptionSource: null, price: number(pair.priceUsd) || null, priceChange24h: dexChange === null || dexChange === undefined || dexChange === "" || !Number.isFinite(Number(dexChange)) ? null : Number(dexChange), marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: number(record(pair.liquidity).usd) || null, volume24h: number(record(pair.volume).h24) || null, holderCount: null, createdAt: number(pair.pairCreatedAt) || null, updatedAt, identityVerified: tokenAddressEquals(token.chain, string(base.address), token.address) } : null;
    const aveItem = ave.get(`${token.chain}:${token.address.toLowerCase()}`);
    const resolved = resolveTokenMarket([aveItem, dex]);
    const trusted = [aveItem, dex].filter((item): item is TokenMarketCandidate => Boolean(item?.identityVerified));
    const fieldSources: Partial<Record<SnapshotField, string>> = {};
    const sourceFor = (field: keyof TokenMarketCandidate) => trusted.find((item) => item[field] !== null)?.source;
    for (const field of ["price", "priceChange24h", "liquidity", "volume24h"] as const) { const owner = sourceFor(field); if (owner) fieldSources[field] = owner; }
    if (resolved.marketCapSource) fieldSources.marketCap = resolved.marketCapSource;
    if (resolved.holderSource) fieldSources.holders = resolved.holderSource;
    const fieldUpdatedAt = Object.fromEntries(Object.keys(fieldSources).map((field) => [field, updatedAt]));
    return { chain: token.chain, address: token.address, tokenAddress: token.address, pairAddress: resolved.pairAddress, symbol: resolved.symbol, decimals: resolved.decimals, price: resolved.price ?? 0, priceChange24h: resolved.priceChange24h, change24hSource: resolved.change24hSource, change24hUpdatedAt: resolved.change24hUpdatedAt, marketCap: resolved.marketCap ?? 0, marketCapKind: resolved.marketCapKind, marketCapSource: resolved.marketCapSource, marketDataConflict: resolved.marketDataConflict, marketCapCandidates: resolved.marketCapCandidates, liquidity: resolved.liquidity ?? 0, holders: resolved.holderCount, holderSource: resolved.holderSource, holderUpdatedAt: resolved.holderUpdatedAt, volume24h: resolved.volume24h ?? 0, updatedAt, sourceTimestamp: updatedAt, receivedAt: updatedAt, source: trusted.some((item) => item.source === "ave") ? "Ave.ai" : trusted.some((item) => item.source === "dex") ? "DexScreener" : "unavailable", identityVerified: trusted.length > 0, fieldSources, fieldUpdatedAt, staleFields: [], conflictFields: resolved.marketDataConflict ? ["marketCap"] : [] };
  });
}
