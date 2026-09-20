type JsonRecord = Record<string, unknown>;

export type MarketSource = "okx" | "ave" | "gmgn" | "dex";
export type MarketCapKind = "market_cap" | "computed" | "fdv" | null;

export type TokenMarketCandidate = {
  source: MarketSource;
  chain: string;
  address: string;
  pairAddress: string;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  descriptionSource: string | null;
  website?: string;
  socials?: Record<string, string>;
  price: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  decimals: number | null;
  liquidity: number | null;
  volume24h: number | null;
  holderCount: number | null;
  createdAt: number | null;
  updatedAt: string;
  identityVerified: boolean;
  fieldTimestamps?: Record<string, string>;
  staleFields?: string[];
  conflicts?: string[];
};

export type ResolvedTokenMarket = TokenMarketCandidate & {
  marketCapKind: MarketCapKind;
  marketCapSource: MarketSource | null;
  filterMarketCap: number | null;
  holderSource: MarketSource | null;
  holderUpdatedAt: string | null;
  marketDataConflict: boolean;
  marketCapCandidates: Partial<Record<MarketSource, number>>;
  selectionReason: string;
  change24hSource: MarketSource | null;
  change24hUpdatedAt: string | null;
  descriptionUpdatedAt: string | null;
  website: string;
  socials: Record<string, string>;
  sourceTimestamp: string;
  fieldTimestamps: Record<string, string>;
  staleFields: string[];
  conflicts: string[];
};

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function cleanDescription(value: unknown): string {
  const raw = text(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ");
  return raw.replace(/\s+/g, " ").trim().slice(0, 1200);
}
function safeUrl(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch { return ""; }
}
function metadataLinks(token: JsonRecord) {
  const metadata = record(token.metadata); const extensions = record(token.extensions); const social = record(token.socials);
  const website = safeUrl(token.website ?? token.website_url ?? metadata.website ?? extensions.website ?? social.website);
  const sources: Array<[string, unknown]> = [
    ["x", token.twitter ?? token.twitter_url ?? token.x ?? metadata.twitter ?? extensions.twitter ?? social.twitter ?? social.x],
    ["telegram", token.telegram ?? token.telegram_url ?? metadata.telegram ?? extensions.telegram ?? social.telegram],
    ["discord", token.discord ?? token.discord_url ?? metadata.discord ?? extensions.discord ?? social.discord],
  ];
  return { website, socials: Object.fromEntries(sources.map(([name, value]) => [name, safeUrl(value)]).filter(([, value]) => Boolean(value))) };
}
function aveDescription(token: JsonRecord): string {
  const metadata = record(token.metadata);
  const extensions = record(token.extensions);
  const socials = record(token.socials);
  const direct = cleanDescription(token.description ?? token.token_description ?? token.token_introduction ?? token.introduction ?? token.project_intro ?? metadata.description ?? extensions.description ?? socials.description);
  if (direct) return direct;
  const appendix = token.appendix;
  if (typeof appendix === "string") {
    try { const parsed = record(JSON.parse(appendix)); return cleanDescription(parsed.description ?? parsed.introduction ?? parsed.intro); }
    catch { return ""; }
  }
  const parsed = record(appendix);
  return cleanDescription(parsed.description ?? parsed.introduction ?? parsed.intro);
}
function finite(value: unknown, allowZero = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : null;
}
function signed(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function time(value: unknown): number | null {
  const parsed = finite(value);
  return parsed ? (parsed < 1e12 ? parsed * 1000 : parsed) : null;
}
function pick(source: JsonRecord, keys: string[], allowZero = false) {
  for (const key of keys) {
    const value = finite(source[key], allowZero);
    if (value !== null) return value;
  }
  return null;
}
function normalizedSupply(token: JsonRecord, normalized: string[], raw: string[], decimals: number | null) {
  const direct = pick(token, normalized);
  if (direct !== null) return direct;
  const rawValue = pick(token, raw);
  return rawValue !== null && decimals !== null ? rawValue / (10 ** decimals) : null;
}
export function tokenAddressEquals(chain: string, left: string, right: string) {
  return chain === "sol" ? left === right : left.toLowerCase() === right.toLowerCase();
}
function identityMatches(token: JsonRecord, chain: string, address: string) {
  const returnedAddress = text(token.token ?? token.address ?? token.token_address ?? token.contract_address);
  const returnedChain = text(token.chain ?? token.chain_id ?? token.network).toLowerCase();
  const addressOkay = Boolean(returnedAddress) && tokenAddressEquals(chain, returnedAddress, address);
  const aliases: Record<string, string[]> = { sol: ["sol", "solana"], bsc: ["bsc", "56", "bnb", "eip155:56"], base: ["base", "8453", "eip155:8453"], robinhood: ["robinhood", "4663", "eip155:4663"] };
  const chainOkay = Boolean(returnedChain) && (aliases[chain] || [chain]).includes(returnedChain);
  return addressOkay && chainOkay;
}

export function parseAveToken(payload: unknown, chain: string, address: string, now = new Date().toISOString()): TokenMarketCandidate | null {
  const root = record(payload); const data = record(root.data);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(data.tokens) ? data.tokens : [];
  const token = record(data.token ?? root.token ?? rows.find((row) => identityMatches(record(row), chain, address)) ?? data);
  if (!Object.keys(token).length) return null;
  const decimals = pick(token, ["decimal", "decimals"], true);
  const links = metadataLinks(token);
  return {
    source: "ave", chain, address, pairAddress: text(token.main_pair), name: text(token.name), symbol: text(token.symbol),
    logo: text(token.logo_url ?? token.logo), description: aveDescription(token), descriptionSource: "ave", ...links,
    price: pick(token, ["current_price_usd", "price_usd", "price"]), priceChange24h: signed(token.price_change_24h ?? token.price_change_24h_percent ?? token.price_change_percent_24h ?? token.price_change_percent24h ?? record(token.price_change).h24), marketCap: pick(token, ["market_cap"]), fdv: pick(token, ["fdv"]),
    circulatingSupply: normalizedSupply(token, ["circulating_supply"], ["circulating_supply_raw"], decimals),
    totalSupply: normalizedSupply(token, ["total", "total_supply"], ["total_supply_raw"], decimals), decimals,
    liquidity: pick(token, ["tvl", "main_pair_tvl"]), volume24h: pick(token, ["tx_volume_u_24h", "volume_24h"]),
    holderCount: pick(token, ["holders", "holder_count"], true), createdAt: time(token.created_at ?? token.launch_at ?? token.open_timestamp),
    updatedAt: now, identityVerified: identityMatches(token, chain, address),
  };
}

export function parseGmgnToken(payload: unknown, chain: string, address: string, now = new Date().toISOString()): TokenMarketCandidate | null {
  const root = record(payload); const data = record(root.data); const rows = Array.isArray(root.data) ? root.data : Array.isArray(data.tokens) ? data.tokens : []; const token = record(data.token ?? root.token ?? rows.find((row) => identityMatches(record(row), chain, address)) ?? data);
  if (!Object.keys(token).length) return null;
  const decimals = pick(token, ["decimals", "decimal"], true);
  const liquidity = record(token.liquidity);
  const links = metadataLinks(token);
  return {
    source: "gmgn", chain, address, pairAddress: text(token.pair_address ?? token.pair), name: text(token.name), symbol: text(token.symbol), logo: text(token.logo ?? token.logo_url),
    description: cleanDescription(token.description ?? token.token_description ?? token.desc ?? token.bio ?? record(token.metadata).description ?? record(token.extensions).description ?? record(token.socials).description), descriptionSource: "gmgn", ...links, price: pick(token, ["price", "price_usd"]), priceChange24h: signed(token.price_change_24h ?? token.price_change_percent_24h ?? token.price_change_percent24h ?? record(token.price_change).h24),
    marketCap: pick(token, ["market_cap", "marketCap", "token_market_cap"]), fdv: pick(token, ["fdv"]),
    circulatingSupply: normalizedSupply(token, ["circulating_supply"], ["circulating_supply_raw"], decimals),
    totalSupply: normalizedSupply(token, ["total_supply", "total"], ["total_supply_raw"], decimals), decimals,
    liquidity: pick(token, ["liquidity_usd"]) ?? pick(liquidity, ["usd"]), volume24h: pick(token, ["volume_24h", "volume24h", "swap_volume_24h"]),
    holderCount: pick(token, ["holder_count", "holders", "holders_count"], true), createdAt: time(token.created_at ?? token.creation_time ?? token.launch_time ?? token.open_timestamp),
    updatedAt: now, identityVerified: identityMatches(token, chain, address),
  };
}

export function resolveTokenMarket(candidates: Array<TokenMarketCandidate | null | undefined>): ResolvedTokenMarket {
  const valid = candidates.filter((value): value is TokenMarketCandidate => Boolean(value));
  const preferred = valid.find((value) => value.source === "okx") ?? valid.find((value) => value.source === "gmgn") ?? valid.find((value) => value.source === "ave") ?? valid[0];
  const blank: TokenMarketCandidate = { source: "dex", chain: "", address: "", pairAddress: "", name: "", symbol: "", logo: "", description: "", descriptionSource: null, website: "", socials: {}, price: null, priceChange24h: null, marketCap: null, fdv: null, circulatingSupply: null, totalSupply: null, decimals: null, liquidity: null, volume24h: null, holderCount: null, createdAt: null, updatedAt: new Date().toISOString(), identityVerified: false };
  const base = preferred ?? blank;
  const caps: Partial<Record<MarketSource, number>> = {};
  for (const item of valid) {
    const computed = item.price && item.circulatingSupply ? item.price * item.circulatingSupply : null;
    const cap = item.marketCap ?? computed;
    if (cap && item.identityVerified) caps[item.source] = cap;
  }
  const verifiedCaps = Object.values(caps).filter((value): value is number => typeof value === "number" && value > 0);
  const conflict = verifiedCaps.length > 1 && Math.max(...verifiedCaps) / Math.min(...verifiedCaps) > 3;
  const marketOwner = valid.find((item) => item.identityVerified && item.marketCap !== null)
    ?? valid.find((item) => item.identityVerified && item.price !== null && item.circulatingSupply !== null);
  const computedCap = marketOwner?.marketCap ?? (marketOwner?.price && marketOwner.circulatingSupply ? marketOwner.price * marketOwner.circulatingSupply : null);
  const fdvOwner = valid.find((item) => item.identityVerified && item.fdv !== null);
  const holderOwner = valid.find((item) => item.holderCount !== null && item.holderCount > 0) ?? valid.find((item) => item.holderCount === 0);
  const metric = <K extends "price" | "priceChange24h" | "liquidity" | "volume24h" | "createdAt">(key: K) => valid.find((item) => item.identityVerified && item[key] !== null)?.[key] ?? null;
  const descriptionOwner = valid.find((item) => item.source === "gmgn" && item.identityVerified && item.description)
    ?? valid.find((item) => item.identityVerified && item.descriptionSource?.startsWith("launchpad") && item.description)
    ?? valid.find((item) => item.source === "ave" && item.identityVerified && item.description)
    ?? valid.find((item) => item.identityVerified && item.description);
  const changeOwner = valid.find((item) => item.identityVerified && item.priceChange24h !== null);
  const metadataOwner = valid.find((item) => item.source === "gmgn" && item.identityVerified && (item.website || Object.keys(item.socials || {}).length))
    ?? valid.find((item) => item.identityVerified && (item.website || Object.keys(item.socials || {}).length));
  const fieldTimestamps = Object.fromEntries(["price", "priceChange24h", "marketCap", "liquidity", "volume24h", "holderCount", "description"].map((field) => {
    const owner = valid.find((item) => item.identityVerified && (field === "description" ? Boolean(item.description) : item[field as keyof TokenMarketCandidate] !== null && item[field as keyof TokenMarketCandidate] !== undefined));
    return owner ? [field, owner.updatedAt] : null;
  }).filter((entry): entry is [string, string] => Boolean(entry)));
  return {
    ...base,
    name: valid.find((item) => item.identityVerified && item.name)?.name ?? "", symbol: valid.find((item) => item.identityVerified && item.symbol)?.symbol ?? "", logo: valid.find((item) => item.identityVerified && item.logo)?.logo ?? "", description: descriptionOwner?.description ?? "", descriptionSource: descriptionOwner?.descriptionSource ?? descriptionOwner?.source ?? null,
    price: metric("price"), priceChange24h: metric("priceChange24h"), marketCap: computedCap, fdv: fdvOwner?.fdv ?? null,
    liquidity: metric("liquidity"), volume24h: metric("volume24h"), createdAt: metric("createdAt"),
    holderCount: holderOwner?.holderCount ?? null, holderSource: holderOwner?.source ?? null, holderUpdatedAt: holderOwner?.updatedAt ?? null,
    marketCapKind: computedCap !== null ? (marketOwner?.marketCap !== null ? "market_cap" : "computed") : null,
    marketCapSource: marketOwner?.source ?? null, filterMarketCap: verifiedCaps.length ? Math.max(...verifiedCaps) : null,
    marketDataConflict: conflict, marketCapCandidates: caps,
    pairAddress: valid.find((item) => item.pairAddress)?.pairAddress ?? "", identityVerified: valid.some((item) => item.identityVerified),
    selectionReason: conflict ? "verified market caps differ by more than 3x; filter uses the higher value" : computedCap !== null ? "trusted token-level market cap" : fdvOwner ? "market cap unavailable; FDV kept separate" : "market cap unavailable",
    change24hSource: changeOwner?.source ?? null, change24hUpdatedAt: changeOwner?.updatedAt ?? null,
    descriptionUpdatedAt: descriptionOwner?.updatedAt ?? null,
    website: metadataOwner?.website ?? "", socials: metadataOwner?.socials ?? {}, sourceTimestamp: base.updatedAt,
    fieldTimestamps, staleFields: [...new Set(valid.flatMap((item) => item.staleFields || []))],
    conflicts: conflict ? ["marketCap"] : [...new Set(valid.flatMap((item) => item.conflicts || []))],
  };
}
