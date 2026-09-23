import type { MarketData } from "@/lib/market";
import { resolveTokenMarket, tokenAddressEquals, type MarketCapKind, type MarketSource, type TokenMarketCandidate } from "@/lib/token-market";
import type { OkxCredentials, OkxRequestMeta } from "@/lib/providers/okx";

type JsonRecord = Record<string, unknown>;
type DexPair = JsonRecord & { _requestedChain: string };
export type SnapshotField = "price" | "priceChange24h" | "marketCap" | "liquidity" | "volume24h" | "holders";
export type BatchMarketItem = Pick<MarketData, "price" | "priceChange24h" | "marketCap" | "liquidity" | "holders" | "volume24h"> & Partial<Pick<MarketData, "marketDataConflict" | "marketCapCandidates" | "holderSource" | "holderUpdatedAt" | "change24hSource" | "change24hUpdatedAt">> & {
  chain: string; address: string; tokenAddress: string; pairAddress: string; symbol: string; decimals: number | null;
  updatedAt: string; sourceTimestamp: string; receivedAt: string; source: string; identityVerified: boolean;
  marketCapKind?: MarketCapKind; marketCapSource?: MarketSource | null;
  fieldSources: Partial<Record<SnapshotField, string>>; fieldUpdatedAt: Partial<Record<SnapshotField, string>>;
  staleFields: SnapshotField[]; conflictFields: SnapshotField[];
  providerMeta?: OkxRequestMeta;
};
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function getBatchMarketData(tokens: Array<{ chain: string; address: string }>, credentials?: OkxCredentials | null): Promise<BatchMarketItem[]> {
  void credentials; // Kept for compatibility; routine market batching must not call OKX Premium.
  const groups = new Map<string, string[]>();
  for (const token of tokens.slice(0, 30)) {
    if (!dexChain[token.chain] || !token.address) continue;
    const list = groups.get(token.chain) || [];
    if (!list.some((value) => value.toLowerCase() === token.address.toLowerCase())) list.push(token.address);
    groups.set(token.chain, list);
  }
  const updatedAt = new Date().toISOString();
  const batches = await Promise.all([...groups].map(async ([chain, addresses]): Promise<DexPair[]> => {
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/${dexChain[chain]}/${addresses.map(encodeURIComponent).join(",")}`, { headers: { Accept: "application/json", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      return Array.isArray(payload) ? payload.map((item): DexPair => ({ ...record(item), _requestedChain: chain })) : [];
    } catch { return []; }
  }));
  const pairs = batches.flat();
  return tokens.slice(0, 30).map((token) => {
    const candidates = pairs.filter((pair) => pair._requestedChain === token.chain && tokenAddressEquals(token.chain, string(record(pair.baseToken).address), token.address));
    const pair = candidates.sort((a, b) => number(record(b.liquidity).usd) - number(record(a.liquidity).usd))[0] || {};
    const base = record(pair.baseToken);
    const dexChange = record(pair.priceChange).h24;
    const dex: TokenMarketCandidate | null = Object.keys(pair).length ? { source: "dex", chain: token.chain, address: string(base.address), pairAddress: string(pair.pairAddress), name: string(base.name), symbol: string(base.symbol), logo: "", description: "", descriptionSource: null, price: number(pair.priceUsd) || null, priceChange24h: dexChange === null || dexChange === undefined || dexChange === "" || !Number.isFinite(Number(dexChange)) ? null : Number(dexChange), marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: number(record(pair.liquidity).usd) || null, volume24h: number(record(pair.volume).h24) || null, holderCount: null, createdAt: number(pair.pairCreatedAt) || null, updatedAt, identityVerified: tokenAddressEquals(token.chain, string(base.address), token.address) } : null;
    const resolved = resolveTokenMarket([dex]);
    const trusted = [dex].filter((item): item is TokenMarketCandidate => Boolean(item?.identityVerified));
    const fieldSources: Partial<Record<SnapshotField, string>> = {};
    const sourceFor = (field: keyof TokenMarketCandidate) => trusted.find((item) => item[field] !== null)?.source;
    for (const field of ["price", "priceChange24h", "liquidity", "volume24h"] as const) { const owner = sourceFor(field); if (owner) fieldSources[field] = owner; }
    if (resolved.marketCapSource) fieldSources.marketCap = resolved.marketCapSource;
    if (resolved.holderSource) fieldSources.holders = resolved.holderSource;
    const fieldUpdatedAt = Object.fromEntries(Object.keys(fieldSources).map((field) => [field, updatedAt]));
    return { chain: token.chain, address: token.address, tokenAddress: token.address, pairAddress: resolved.pairAddress, symbol: resolved.symbol, decimals: resolved.decimals, price: resolved.price ?? 0, priceChange24h: resolved.priceChange24h, change24hSource: resolved.change24hSource, change24hUpdatedAt: resolved.change24hUpdatedAt, marketCap: resolved.marketCap ?? 0, marketCapKind: resolved.marketCapKind, marketCapSource: resolved.marketCapSource, marketDataConflict: resolved.marketDataConflict, marketCapCandidates: resolved.marketCapCandidates, liquidity: resolved.liquidity ?? 0, holders: resolved.holderCount, holderSource: resolved.holderSource, holderUpdatedAt: resolved.holderUpdatedAt, volume24h: resolved.volume24h ?? 0, updatedAt, sourceTimestamp: resolved.updatedAt || updatedAt, receivedAt: updatedAt, source: trusted.some((item) => item.source === "dex") ? "DexScreener" : "unavailable", identityVerified: trusted.length > 0, fieldSources, fieldUpdatedAt, staleFields: [], conflictFields: resolved.marketDataConflict ? ["marketCap"] : [] };
  });
}
