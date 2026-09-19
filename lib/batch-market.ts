import type { MarketData } from "@/lib/market";

type JsonRecord = Record<string, unknown>;
type DexPair = JsonRecord & { _requestedChain: string };
export type BatchMarketItem = Pick<MarketData, "price" | "marketCap" | "liquidity" | "volume24h"> & { chain: string; address: string; updatedAt: string; source: string };
const dexChain: Record<string, string> = { sol: "solana", bsc: "bsc", base: "base", robinhood: "robinhood" };
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function getBatchMarketData(tokens: Array<{ chain: string; address: string }>): Promise<BatchMarketItem[]> {
  const groups = new Map<string, string[]>();
  for (const token of tokens.slice(0, 30)) {
    if (!dexChain[token.chain] || !token.address) continue;
    const list = groups.get(token.chain) || [];
    if (!list.some((value) => value.toLowerCase() === token.address.toLowerCase())) list.push(token.address);
    groups.set(token.chain, list);
  }
  const updatedAt = new Date().toISOString();
  const batches: DexPair[][] = await Promise.all([...groups].map(async ([chain, addresses]): Promise<DexPair[]> => {
    try {
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/${dexChain[chain]}/${addresses.map(encodeURIComponent).join(",")}`, { headers: { Accept: "application/json", "User-Agent": "KOL-Signal-Monitor/1.0" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      return Array.isArray(payload) ? payload.map((item): DexPair => ({ ...record(item), _requestedChain: chain })) : [];
    } catch { return []; }
  }));
  const pairs = batches.flat();
  return tokens.slice(0, 30).map((token) => {
    const candidates = pairs.filter((pair) => pair._requestedChain === token.chain && string(record(pair.baseToken).address).toLowerCase() === token.address.toLowerCase());
    const pair = candidates.sort((a, b) => number(record(b.liquidity).usd) - number(record(a.liquidity).usd))[0] || {};
    return { chain: token.chain, address: token.address, price: number(pair.priceUsd), marketCap: number(pair.marketCap) || number(pair.fdv), liquidity: number(record(pair.liquidity).usd), volume24h: number(record(pair.volume).h24), updatedAt, source: Object.keys(pair).length ? "DexScreener" : "unavailable" };
  });
}
