import { OkxMarketClient, okxCredentialsFromEnv, type SupportedMarketChain } from "@/lib/providers/okx";
import { recordExternalHttp } from "@/lib/external-api-control";
import { normalizeVerifiedRadarAddress } from "@/lib/radar/identity";
import type { RadarCandidate, RadarChain } from "@/lib/radar/types";

export const ENRICHMENT_STATUSES = ["PENDING", "RETRY_SCHEDULED", "UNAVAILABLE", "UNSUPPORTED_DEX", "RPC_ERROR", "RATE_LIMITED", "DATA_CONFLICT", "VERIFIED", "FAILED", "NOT_APPLICABLE"] as const;
export type EnrichmentStatus = typeof ENRICHMENT_STATUSES[number];
export const PROPAGATION_STAGES = ["NO_PROPAGATION_EVIDENCE", "EMERGING", "SPREADING", "ACCELERATING", "PEAK", "DECLINING"] as const;
export type PropagationStage = typeof PROPAGATION_STAGES[number];
export const LEAD_TIMINGS = ["VERY_EARLY", "EARLY", "SYNCHRONOUS", "LATE", "OVERHEATED", "INSUFFICIENT_EVIDENCE"] as const;
export type LeadTiming = typeof LEAD_TIMINGS[number];
export const TRADE_DATA_STAGES = ["PAIR_DISCOVERY_PENDING", "PAIR_DISCOVERED", "PAIR_VERIFIED", "LIQUIDITY_VERIFIED", "BUY_ROUTE_VERIFIED", "SELL_ROUTE_VERIFIED", "QUOTE_READY", "TRADE_DATA_READY", "FAILED", "RETRY_SCHEDULED"] as const;
export type TradeDataStage = typeof TRADE_DATA_STAGES[number];

export type FieldState<T> = { status: EnrichmentStatus; value: T | null; source: string | null; checked_at: string | null; block_number: number | null; error_code: string | null; error_reason: string | null; retry_count: number; next_retry_at: string | null; terminal: boolean };
export type DexRegistryEntry = { chain: RadarChain; dexId: string; factoryAddress: string; routerAddress: string; poolType: "V2" | "V3" | "CLMM"; quoteTokens: Array<{ symbol: string; address: string; decimals: number; stable: boolean }>; feeTiers: number[]; verifiedSource: string; enabled: boolean };
export type PoolCandidate = { pairAddress: string; poolType: DexRegistryEntry["poolType"] | "UNKNOWN"; dexId: string | null; factoryAddress: string | null; routerAddress: string | null; token0: string | null; token1: string | null; quoteToken: string | null; feeTier: number | null; liquidityUsd: number | null; liquiditySource: string | null; source: string; status: "DISCOVERED" | "VERIFIED" | "REJECTED"; blockNumber: number | null; checkedAt: string; errorCode: string | null; errorReason: string | null };
export type QuoteBand = { amountUsd: number; buyAmountOut: string | null; sellAmountOutUsd: string | null; priceImpactBps: number | null; roundTripLossBps: number | null; status: EnrichmentStatus; errorCode: string | null; quotedAt: string; blockNumber: number | null };

const BSC_QUOTES = [
  { symbol: "WBNB", address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", decimals: 18, stable: false },
  { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, stable: true },
  { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, stable: true },
  { symbol: "FDUSD", address: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409", decimals: 18, stable: true },
] as const;

export const DEX_REGISTRY: DexRegistryEntry[] = [
  { chain: "bsc", dexId: "cakev2", factoryAddress: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", routerAddress: "0x10ed43c718714eb63d5aa57b78b54704e256024e", poolType: "V2", quoteTokens: [...BSC_QUOTES], feeTiers: [], verifiedSource: "https://github.com/pancakeswap/pancake-swap-core", enabled: true },
  { chain: "bsc", dexId: "pancakev3", factoryAddress: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865", routerAddress: "0x1b81d678ffb9c0263b24a97847620c99d213eb14", poolType: "V3", quoteTokens: [...BSC_QUOTES], feeTiers: [100, 500, 2500, 10000], verifiedSource: "https://github.com/pancakeswap/pancake-v3-contracts/blob/main/deployments/bscMainnet.json", enabled: true },
];

const AVATAR_HOSTS = ["ave.ai", "www.ave.ai", "gmgn.ai", "gmgn.app", "static.okx.com", "www.okx.com", "ipfs.io", "cloudflare-ipfs.com", "token-icons.s3.amazonaws.com"];
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function positive(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function normalizeAddress(chain: string, address: string) { return chain === "sol" ? address : address.toLowerCase(); }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function padAddress(address: string) { return address.toLowerCase().replace(/^0x/, "").padStart(64, "0"); }
function wordAddress(value: string) { const hex = value.replace(/^0x/, ""); return hex.length >= 40 ? `0x${hex.slice(-40).toLowerCase()}` : null; }
function wordUint(value: string, offset = 0) { const hex = value.replace(/^0x/, "").slice(offset * 64, offset * 64 + 64); return hex ? BigInt(`0x${hex}`) : BigInt(0); }
function iso(value: unknown) { if (!value) return null; const date = new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }

export function fieldState<T>(status: EnrichmentStatus, value: T | null, options: Partial<Omit<FieldState<T>, "status" | "value">> = {}): FieldState<T> {
  return { status, value, source: options.source ?? null, checked_at: options.checked_at ?? null, block_number: options.block_number ?? null, error_code: options.error_code ?? null, error_reason: options.error_reason ?? null, retry_count: options.retry_count ?? 0, next_retry_at: options.next_retry_at ?? null, terminal: options.terminal ?? ["UNAVAILABLE", "UNSUPPORTED_DEX", "VERIFIED", "FAILED", "NOT_APPLICABLE"].includes(status) };
}

export function safeAvatarUrl(value: unknown) {
  const raw = text(value); if (!raw) return null;
  try { const url = new URL(raw); const host = url.hostname.toLowerCase(); if (url.protocol !== "https:" || !AVATAR_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null; url.username = ""; url.password = ""; url.hash = ""; return url.toString().slice(0, 1_500); } catch { return null; }
}
export function validAvatarContentType(value: string | null) { return IMAGE_TYPES.has(String(value || "").split(";")[0].trim().toLowerCase()); }
export function identiconUrl(chain: string, address: string) { return `/api/radar/avatar?key=${encodeURIComponent(`${chain}:${normalizeAddress(chain, address)}`)}`; }
export function proxiedAvatarUrl(original: string | null, chain: string, address: string) { return original ? `/api/radar/avatar?url=${encodeURIComponent(original)}&key=${encodeURIComponent(`${chain}:${normalizeAddress(chain, address)}`)}` : identiconUrl(chain, address); }

function walk(value: unknown, visit: (row: Record<string, unknown>) => void, depth = 0) {
  if (depth > 5) return;
  if (Array.isArray(value)) { for (const item of value.slice(0, 100)) walk(item, visit, depth + 1); return; }
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>; visit(row);
  for (const child of Object.values(row)) if (child && typeof child === "object") walk(child, visit, depth + 1);
}
function firstDeepString(value: unknown, keys: string[]) { let found = ""; walk(value, (row) => { if (found) return; for (const key of keys) { const candidate = text(row[key]); if (candidate) { found = candidate; break; } } }); return found; }
function firstDeepNumber(value: unknown, keys: string[]) { let found: number | null = null; walk(value, (row) => { if (found !== null) return; for (const key of keys) { const candidate = positive(row[key]); if (candidate !== null) { found = candidate; break; } } }); return found; }

export function extractProviderAvatar(payload: unknown) { return safeAvatarUrl(firstDeepString(payload, ["logo", "logo_url", "logoUrl", "tokenLogoUrl", "icon", "icon_url", "image", "image_url"])); }
export function chooseAvatar(input: { ave?: unknown; gmgn?: unknown; okx?: unknown; chain: string; address: string }, now = new Date().toISOString()) {
  const candidates = [["ave", extractProviderAvatar(input.ave)], ["gmgn", extractProviderAvatar(input.gmgn)], ["okx", extractProviderAvatar(input.okx)]] as const;
  const selected = candidates.find(([, url]) => Boolean(url)); const original = selected?.[1] || null;
  return { avatar_original_url: original, avatar_resolved_url: proxiedAvatarUrl(original, input.chain, input.address), avatar_source: selected?.[0] || "identicon", avatar_checked_at: now, avatar_status: original ? "VERIFIED" : "FALLBACK_IDENTICON", avatar_error_code: original ? null : "AVATAR_NOT_RETURNED" };
}

export function normalizePropagationStage(value: unknown, narrativeStatus = "COMPLETED", evidenceCount = 0): PropagationStage | "ANALYSIS_FAILED" | "ANALYZING" {
  if (["PENDING", "RUNNING", "RETRYING"].includes(narrativeStatus)) return "ANALYZING";
  if (["FAILED", "NOT_CONFIGURED"].includes(narrativeStatus)) return "ANALYSIS_FAILED";
  if (narrativeStatus === "INSUFFICIENT_EVIDENCE" || evidenceCount === 0) return "NO_PROPAGATION_EVIDENCE";
  const raw = String(value || "").trim().toUpperCase();
  const map: Record<string, PropagationStage> = { "无传播证据": "NO_PROPAGATION_EVIDENCE", "萌芽": "EMERGING", "扩散": "SPREADING", "加速": "ACCELERATING", "高潮": "PEAK", "退潮": "DECLINING", NO_PROPAGATION_EVIDENCE: "NO_PROPAGATION_EVIDENCE", EMERGING: "EMERGING", SPREADING: "SPREADING", ACCELERATING: "ACCELERATING", PEAK: "PEAK", DECLINING: "DECLINING" };
  return map[raw] || "NO_PROPAGATION_EVIDENCE";
}
export function leadTimingFromScore(score: number | null, narrativeStatus = "COMPLETED", evidenceCount = 0): LeadTiming {
  if (narrativeStatus !== "COMPLETED" || evidenceCount === 0 || score === null || !Number.isFinite(score)) return "INSUFFICIENT_EVIDENCE";
  if (score >= 85) return "VERY_EARLY"; if (score >= 70) return "EARLY"; if (score >= 45) return "SYNCHRONOUS"; if (score >= 25) return "LATE"; return "OVERHEATED";
}

export function extractActivity(payloads: unknown[]) {
  const root = payloads; return {
    uniqueBuyers24h: firstDeepNumber(root, ["unique_buyers_24h", "buyers_24h", "buyer_count_24h", "buy_address_count_24h"]),
    uniqueSellers24h: firstDeepNumber(root, ["unique_sellers_24h", "sellers_24h", "seller_count_24h", "sell_address_count_24h"]),
    buyTx24h: firstDeepNumber(root, ["buy_tx_24h", "buys_24h", "buy_count_24h", "buy_transactions_24h"]),
    sellTx24h: firstDeepNumber(root, ["sell_tx_24h", "sells_24h", "sell_count_24h", "sell_transactions_24h"]),
  };
}

export function extractTokenCreatedAt(payloads: unknown[]) { return iso(firstDeepString(payloads, ["token_created_at", "token_create_time", "created_at", "creation_time", "deploy_time"])); }

export function extractPoolCandidates(payloads: Array<{ source: string; payload: unknown }>, chain: RadarChain, tokenAddress: string, now = new Date().toISOString()): PoolCandidate[] {
  const results = new Map<string, PoolCandidate>(); const target = normalizeAddress(chain, tokenAddress);
  for (const input of payloads) walk(input.payload, (row) => {
    const rawPair = firstDeepString(row, ["pair_address", "pairAddress", "pool_address", "poolAddress", "lp_address", "lpAddress"]);
    const pair = normalizeVerifiedRadarAddress(chain, rawPair); if (!pair || normalizeAddress(chain, pair) === target) return;
    const token0 = normalizeVerifiedRadarAddress(chain, text(row.token0 ?? row.token0_address ?? row.base_token_address));
    const token1 = normalizeVerifiedRadarAddress(chain, text(row.token1 ?? row.token1_address ?? row.quote_token_address));
    const includesToken = !token0 && !token1 ? false : [token0, token1].filter(Boolean).some((item) => normalizeAddress(chain, String(item)) === target);
    const liquidity = positive(row.liquidity_usd ?? row.liquidity ?? row.reserve_usd ?? row.tvl);
    const key = normalizeAddress(chain, pair); const existing = results.get(key);
    const candidate: PoolCandidate = { pairAddress: pair, poolType: String(row.pool_type || row.type || "UNKNOWN").toUpperCase().includes("V3") ? "V3" : String(row.pool_type || row.type || "UNKNOWN").toUpperCase().includes("V2") ? "V2" : "UNKNOWN", dexId: text(row.dex_id ?? row.dexId ?? row.dex ?? row.amm).toLowerCase() || null, factoryAddress: normalizeVerifiedRadarAddress(chain, row.factory_address ?? row.factoryAddress), routerAddress: normalizeVerifiedRadarAddress(chain, row.router_address ?? row.routerAddress), token0, token1, quoteToken: token0 && normalizeAddress(chain, token0) !== target ? token0 : token1 && normalizeAddress(chain, token1) !== target ? token1 : null, feeTier: positive(row.fee_tier ?? row.feeTier), liquidityUsd: liquidity, liquiditySource: liquidity === null ? null : input.source, source: input.source, status: includesToken ? "VERIFIED" : "DISCOVERED", blockNumber: positive(row.block_number ?? row.blockNumber), checkedAt: now, errorCode: includesToken ? null : "TOKEN_PAIR_RELATION_UNVERIFIED", errorReason: includesToken ? null : "Provider未同时返回可验证的token0/token1" };
    if (!existing || (candidate.status === "VERIFIED" && existing.status !== "VERIFIED") || (candidate.liquidityUsd || 0) > (existing.liquidityUsd || 0)) results.set(key, candidate);
  });
  return [...results.values()];
}
export function selectPrimaryPool(pools: PoolCandidate[]) { return pools.filter((pool) => pool.status === "VERIFIED").sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))[0] || null; }

export function marketConflict(values: Array<number | null>, ratio = 1.5) { const valid = values.filter((value): value is number => value !== null && Number.isFinite(value) && value > 0); return valid.length > 1 && Math.max(...valid) / Math.min(...valid) > ratio; }

export function tradeDataStage(input: { pairDiscovered: boolean; pairVerified: boolean; liquidityVerified: boolean; buyRouteVerified: boolean; sellRouteVerified: boolean; quoteBandsReady: number; failed?: boolean; retry?: boolean }): TradeDataStage {
  if (input.failed) return "FAILED"; if (input.retry) return "RETRY_SCHEDULED"; if (!input.pairDiscovered) return "PAIR_DISCOVERY_PENDING"; if (!input.pairVerified) return "PAIR_DISCOVERED"; if (!input.liquidityVerified) return "PAIR_VERIFIED"; if (!input.buyRouteVerified) return "LIQUIDITY_VERIFIED"; if (!input.sellRouteVerified) return "BUY_ROUTE_VERIFIED"; if (input.quoteBandsReady < 4) return "SELL_ROUTE_VERIFIED"; return "TRADE_DATA_READY";
}

export function dexRegistryFor(chain: RadarChain, dexId?: string | null) {
  const aliases: Record<string, string> = { cake: "cakev2", pancakeswap: "cakev2", pancakeswapv2: "cakev2", pancakev3: "pancakev3", pancakeclamm: "pancakev3" };
  const raw = String(dexId || "").toLowerCase().replace(/[^a-z0-9]/g, ""); const normalized = aliases[raw] || raw;
  return DEX_REGISTRY.filter((entry) => entry.chain === chain && entry.enabled && (!normalized || entry.dexId === normalized));
}

type RpcResult = { result?: string; error?: { code?: number; message?: string } };
export async function rpcCall(rpcUrl: string, method: string, params: unknown[], context: { db?: D1Database; chain: string; task: string }, fetcher: typeof fetch = fetch) {
  const started = Date.now(); let response: Response;
  try { response = await fetcher(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }), signal: AbortSignal.timeout(8_000) }); }
  catch (error) { await recordExternalHttp(context.db, { provider: "rpc", tier: "free", endpoint: method, task: context.task, chain: context.chain, status: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network_error", latencyMs: Date.now() - started, retryNumber: 0 }); throw error; }
  await recordExternalHttp(context.db, { provider: "rpc", tier: "free", endpoint: method, task: context.task, chain: context.chain, status: response.ok ? "success" : "http_error", httpStatus: response.status, latencyMs: Date.now() - started, retryNumber: 0, rateLimited: response.status === 429 });
  const payload = await response.json() as RpcResult; if (!response.ok || payload.error || typeof payload.result !== "string") throw new Error(payload.error?.message || `RPC_HTTP_${response.status}`); return payload.result;
}
async function ethCall(rpcUrl: string, to: string, data: string, context: { db?: D1Database; chain: string; task: string }, fetcher: typeof fetch) { return rpcCall(rpcUrl, "eth_call", [{ to, data }, "latest"], context, fetcher); }

export async function verifyV2Pool(input: { rpcUrl: string; registry: DexRegistryEntry; tokenAddress: string; quoteToken: DexRegistryEntry["quoteTokens"][number]; db?: D1Database; fetcher?: typeof fetch }) {
  const fetcher = input.fetcher || fetch; const context = { db: input.db, chain: input.registry.chain, task: "radar_pair_verification" };
  const pairRaw = await ethCall(input.rpcUrl, input.registry.factoryAddress, `0xe6a43905${padAddress(input.tokenAddress)}${padAddress(input.quoteToken.address)}`, context, fetcher); const pairAddress = wordAddress(pairRaw);
  if (!pairAddress || /^0x0{40}$/.test(pairAddress)) return null;
  const [token0Raw, token1Raw, factoryRaw, reservesRaw, totalSupplyRaw, blockRaw] = await Promise.all([
    ethCall(input.rpcUrl, pairAddress, "0x0dfe1681", context, fetcher), ethCall(input.rpcUrl, pairAddress, "0xd21220a7", context, fetcher), ethCall(input.rpcUrl, pairAddress, "0xc45a0155", context, fetcher), ethCall(input.rpcUrl, pairAddress, "0x0902f1ac", context, fetcher), ethCall(input.rpcUrl, pairAddress, "0x18160ddd", context, fetcher), rpcCall(input.rpcUrl, "eth_blockNumber", [], context, fetcher),
  ]);
  const token0 = wordAddress(token0Raw); const token1 = wordAddress(token1Raw); const factory = wordAddress(factoryRaw); const wanted = normalizeAddress("bsc", input.tokenAddress); const quote = normalizeAddress("bsc", input.quoteToken.address);
  const valid = Boolean(token0 && token1 && factory && normalizeAddress("bsc", factory) === normalizeAddress("bsc", input.registry.factoryAddress) && [token0, token1].map((item) => normalizeAddress("bsc", String(item))).includes(wanted) && [token0, token1].map((item) => normalizeAddress("bsc", String(item))).includes(quote));
  const reserve0 = wordUint(reservesRaw, 0); const reserve1 = wordUint(reservesRaw, 1); const quoteReserve = token0 && normalizeAddress("bsc", token0) === quote ? reserve0 : reserve1; const liquidityUsd = input.quoteToken.stable ? Number(quoteReserve) / 10 ** input.quoteToken.decimals * 2 : null;
  return { pairAddress, token0, token1, factoryAddress: factory, reserve0: reserve0.toString(), reserve1: reserve1.toString(), totalSupply: wordUint(totalSupplyRaw).toString(), liquidityUsd, blockNumber: Number(BigInt(blockRaw)), valid };
}

function encodeAddressArray(addresses: string[]) { const offset = "40".padStart(64, "0"); const count = addresses.length.toString(16).padStart(64, "0"); return `${offset}${count}${addresses.map(padAddress).join("")}`; }
async function getAmountsOut(rpcUrl: string, router: string, amount: bigint, path: string[], context: { db?: D1Database; chain: string; task: string }, fetcher: typeof fetch) { const data = `0xd06ca61f${amount.toString(16).padStart(64, "0")}${encodeAddressArray(path)}`; const raw = await ethCall(rpcUrl, router, data, context, fetcher); const hex = raw.replace(/^0x/, ""); const length = Number(BigInt(`0x${hex.slice(64, 128) || "0"}`)); return Array.from({ length }, (_, index) => BigInt(`0x${hex.slice(128 + index * 64, 192 + index * 64) || "0"}`)); }
export async function quoteV2Bands(input: { rpcUrl: string; registry: DexRegistryEntry; tokenAddress: string; quoteToken: DexRegistryEntry["quoteTokens"][number]; tokenDecimals: number; db?: D1Database; fetcher?: typeof fetch }, amounts = [10, 50, 100, 500]) {
  const fetcher = input.fetcher || fetch; const context = { db: input.db, chain: input.registry.chain, task: "radar_readonly_quote" }; const quotedAt = new Date().toISOString(); const blockRaw = await rpcCall(input.rpcUrl, "eth_blockNumber", [], context, fetcher); const blockNumber = Number(BigInt(blockRaw)); const rows: QuoteBand[] = [];
  for (const amountUsd of amounts) try { const zero = BigInt(0); const inputAmount = BigInt(amountUsd) * BigInt(10) ** BigInt(input.quoteToken.decimals); const buy = await getAmountsOut(input.rpcUrl, input.registry.routerAddress, inputAmount, [input.quoteToken.address, input.tokenAddress], context, fetcher); const tokenOut = buy.at(-1) || zero; const sell = tokenOut > zero ? await getAmountsOut(input.rpcUrl, input.registry.routerAddress, tokenOut, [input.tokenAddress, input.quoteToken.address], context, fetcher) : []; const returned = sell.at(-1) || zero; const loss = inputAmount > zero ? Number((inputAmount - returned) * BigInt(10_000) / inputAmount) : null; rows.push({ amountUsd, buyAmountOut: tokenOut > zero ? (Number(tokenOut) / 10 ** input.tokenDecimals).toString() : null, sellAmountOutUsd: returned > zero ? (Number(returned) / 10 ** input.quoteToken.decimals).toString() : null, priceImpactBps: loss === null ? null : Math.max(0, Math.round(loss / 2)), roundTripLossBps: loss, status: tokenOut > zero && returned > zero ? "VERIFIED" : "FAILED", errorCode: tokenOut > zero && returned > zero ? null : "ZERO_AMOUNT_OUT", quotedAt, blockNumber }); }
  catch (error) { rows.push({ amountUsd, buyAmountOut: null, sellAmountOutUsd: null, priceImpactBps: null, roundTripLossBps: null, status: "RPC_ERROR", errorCode: error instanceof Error ? error.message.slice(0, 120) : "RPC_ERROR", quotedAt, blockNumber }); }
  return rows;
}

function retryAt(attempt: number) { return new Date(Date.now() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(attempt, 8))).toISOString(); }
function enrichmentError(error: unknown, attempt: number): FieldState<null> { const message = error instanceof Error ? error.message : "UNKNOWN_ERROR"; const rateLimited = /rate|429/i.test(message); return fieldState<null>(rateLimited ? "RATE_LIMITED" : "RETRY_SCHEDULED", null, { checked_at: new Date().toISOString(), error_code: rateLimited ? "RATE_LIMITED" : "PROVIDER_ERROR", error_reason: message.slice(0, 300), retry_count: attempt, next_retry_at: retryAt(attempt), terminal: false }); }

export async function enrichRadarCandidate(db: D1Database, signalId: number, candidate: RadarCandidate, runtime: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const now = new Date().toISOString(); const prior = await db.prepare("SELECT status,retry_count,next_retry_at FROM radar_enrichment_state WHERE radar_signal_id=?").bind(signalId).first<{ status: string; retry_count: number; next_retry_at: string | null }>().catch(() => null);
  if (prior?.status === "VERIFIED" || (prior?.next_retry_at && Date.parse(prior.next_retry_at) > Date.now())) return { skipped: true, status: prior.status };
  const attempt = Number(prior?.retry_count || 0) + 1; let gmgn: unknown = null; let okx: unknown = null; const errors: FieldState<null>[] = [];
  try { const { getTokenInfo } = await import("@/lib/gmgn"); gmgn = await getTokenInfo(candidate.chain, candidate.tokenAddress); } catch (error) { errors.push(enrichmentError(error, attempt)); }
  const credentials = okxCredentialsFromEnv(runtime); if (credentials && candidate.chain in { sol: 1, bsc: 1, base: 1, robinhood: 1 }) try { okx = (await new OkxMarketClient(credentials, { db, task: "radar_enrichment", fetcher }).tokenSearch(candidate.chain as SupportedMarketChain, candidate.tokenAddress)).value; } catch (error) { errors.push(enrichmentError(error, attempt)); }
  const avatar = chooseAvatar({ ave: candidate.rawSnapshot, gmgn, okx, chain: candidate.chain, address: candidate.tokenAddress }, now);
  const providerPools = extractPoolCandidates([{ source: "ave", payload: candidate.rawSnapshot }, { source: "gmgn", payload: gmgn }, { source: "okx", payload: okx }], candidate.chain, candidate.tokenAddress, now);
  const registry = dexRegistryFor(candidate.chain, candidate.dexId); const rpcUrl = text(runtime[`${candidate.chain.toUpperCase()}_RPC_URL`]); const rpcPools: PoolCandidate[] = [];
  if (candidate.chain === "bsc" && rpcUrl) for (const entry of registry.filter((item) => item.poolType === "V2")) for (const quoteToken of entry.quoteTokens) try { const checked = await verifyV2Pool({ rpcUrl, registry: entry, tokenAddress: candidate.tokenAddress, quoteToken, db, fetcher }); if (checked) rpcPools.push({ pairAddress: checked.pairAddress, poolType: "V2", dexId: entry.dexId, factoryAddress: checked.factoryAddress, routerAddress: entry.routerAddress, token0: checked.token0, token1: checked.token1, quoteToken: quoteToken.address, feeTier: null, liquidityUsd: checked.liquidityUsd, liquiditySource: checked.liquidityUsd === null ? null : "rpc", source: "rpc", status: checked.valid ? "VERIFIED" : "REJECTED", blockNumber: checked.blockNumber, checkedAt: now, errorCode: checked.valid ? null : "PAIR_RELATION_FAILED", errorReason: checked.valid ? null : "token0/token1或factory关系不匹配" }); } catch (error) { errors.push(enrichmentError(error, attempt)); }
  const pools = [...providerPools, ...rpcPools]; const primary = selectPrimaryPool(pools); const activity = extractActivity([gmgn, okx, candidate.rawSnapshot]); const tokenCreatedAt = extractTokenCreatedAt([gmgn, okx, candidate.rawSnapshot]);
  const liquidityValues = unique(pools.map((pool) => pool.liquidityUsd).filter((value): value is number => value !== null)); const conflict = marketConflict(liquidityValues); const liquidity = primary?.liquidityUsd ?? candidate.liquidity; const pairStatus: EnrichmentStatus = primary ? "VERIFIED" : pools.length ? "PENDING" : registry.length ? rpcUrl ? "RETRY_SCHEDULED" : "RPC_ERROR" : "UNSUPPORTED_DEX";
  let quotes: QuoteBand[] = []; if (primary && rpcUrl && primary.poolType === "V2") { const entry = registry.find((item) => item.factoryAddress.toLowerCase() === primary.factoryAddress?.toLowerCase()); const quoteToken = entry?.quoteTokens.find((item) => item.address.toLowerCase() === primary.quoteToken?.toLowerCase()); if (entry && quoteToken) try { quotes = await quoteV2Bands({ rpcUrl, registry: entry, tokenAddress: candidate.tokenAddress, quoteToken, tokenDecimals: Math.round(firstDeepNumber([gmgn, okx], ["decimals", "decimal"]) || 18), db, fetcher }); } catch (error) { errors.push(enrichmentError(error, attempt)); } }
  const stage = tradeDataStage({ pairDiscovered: pools.length > 0, pairVerified: Boolean(primary), liquidityVerified: Boolean(primary && liquidity !== null && !conflict), buyRouteVerified: quotes.some((row) => row.status === "VERIFIED" && row.buyAmountOut !== null), sellRouteVerified: quotes.some((row) => row.status === "VERIFIED" && row.sellAmountOutUsd !== null), quoteBandsReady: quotes.filter((row) => row.status === "VERIFIED").length, retry: errors.length > 0 && !primary });
  const stateStatus: EnrichmentStatus = primary && quotes.filter((row) => row.status === "VERIFIED").length === 4 ? "VERIFIED" : conflict ? "DATA_CONFLICT" : errors[0]?.status || pairStatus; const error = errors[0];
  await db.batch([
    ...pools.map((pool) => db.prepare(`INSERT INTO radar_pool_candidates (radar_signal_id,pair_address,pool_type,dex_id,factory_address,router_address,token0,token1,quote_token,fee_tier,liquidity_usd,liquidity_source,source,status,block_number,checked_at,error_code,error_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(radar_signal_id,pair_address) DO UPDATE SET pool_type=excluded.pool_type,dex_id=COALESCE(excluded.dex_id,radar_pool_candidates.dex_id),factory_address=COALESCE(excluded.factory_address,radar_pool_candidates.factory_address),router_address=COALESCE(excluded.router_address,radar_pool_candidates.router_address),token0=COALESCE(excluded.token0,radar_pool_candidates.token0),token1=COALESCE(excluded.token1,radar_pool_candidates.token1),quote_token=COALESCE(excluded.quote_token,radar_pool_candidates.quote_token),fee_tier=COALESCE(excluded.fee_tier,radar_pool_candidates.fee_tier),liquidity_usd=COALESCE(excluded.liquidity_usd,radar_pool_candidates.liquidity_usd),liquidity_source=COALESCE(excluded.liquidity_source,radar_pool_candidates.liquidity_source),source=excluded.source,status=CASE WHEN excluded.status='VERIFIED' THEN 'VERIFIED' ELSE radar_pool_candidates.status END,block_number=COALESCE(excluded.block_number,radar_pool_candidates.block_number),checked_at=excluded.checked_at,error_code=excluded.error_code,error_reason=excluded.error_reason`).bind(signalId, pool.pairAddress, pool.poolType, pool.dexId, pool.factoryAddress, pool.routerAddress, pool.token0, pool.token1, pool.quoteToken, pool.feeTier, pool.liquidityUsd, pool.liquiditySource, pool.source, pool.status, pool.blockNumber, pool.checkedAt, pool.errorCode, pool.errorReason)),
    ...quotes.map((quote) => db.prepare(`INSERT INTO radar_readonly_quotes (radar_signal_id,amount_usd,buy_amount_out,sell_amount_out_usd,price_impact_bps,round_trip_loss_bps,status,error_code,quoted_at,block_number) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(radar_signal_id,amount_usd) DO UPDATE SET buy_amount_out=excluded.buy_amount_out,sell_amount_out_usd=excluded.sell_amount_out_usd,price_impact_bps=excluded.price_impact_bps,round_trip_loss_bps=excluded.round_trip_loss_bps,status=excluded.status,error_code=excluded.error_code,quoted_at=excluded.quoted_at,block_number=excluded.block_number`).bind(signalId, quote.amountUsd, quote.buyAmountOut, quote.sellAmountOutUsd, quote.priceImpactBps, quote.roundTripLossBps, quote.status, quote.errorCode, quote.quotedAt, quote.blockNumber)),
    db.prepare(`INSERT INTO radar_enrichment_state (radar_signal_id,status,trade_data_stage,avatar_original_url,avatar_resolved_url,avatar_source,avatar_checked_at,avatar_status,avatar_error_code,primary_pair_address,pool_type,dex_id,factory_address,router_address,quote_token,pair_status,pair_source,pair_checked_at,pair_block_number,liquidity_usd,liquidity_source,liquidity_status,liquidity_checked_at,data_conflict,unique_buyers_24h,unique_sellers_24h,buy_tx_24h,sell_tx_24h,activity_source,activity_status,activity_window_start,activity_window_end,token_created_at,token_created_source,token_created_status,pool_created_at,pool_created_source,pool_created_status,system_first_seen_at,error_code,error_reason,retry_count,next_retry_at,terminal,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(radar_signal_id) DO UPDATE SET status=excluded.status,trade_data_stage=excluded.trade_data_stage,avatar_original_url=COALESCE(radar_enrichment_state.avatar_original_url,excluded.avatar_original_url),avatar_resolved_url=CASE WHEN radar_enrichment_state.avatar_status='VERIFIED' THEN radar_enrichment_state.avatar_resolved_url ELSE excluded.avatar_resolved_url END,avatar_source=CASE WHEN radar_enrichment_state.avatar_status='VERIFIED' THEN radar_enrichment_state.avatar_source ELSE excluded.avatar_source END,avatar_checked_at=excluded.avatar_checked_at,avatar_status=CASE WHEN radar_enrichment_state.avatar_status='VERIFIED' THEN radar_enrichment_state.avatar_status ELSE excluded.avatar_status END,avatar_error_code=excluded.avatar_error_code,primary_pair_address=COALESCE(excluded.primary_pair_address,radar_enrichment_state.primary_pair_address),pool_type=COALESCE(excluded.pool_type,radar_enrichment_state.pool_type),dex_id=COALESCE(excluded.dex_id,radar_enrichment_state.dex_id),factory_address=COALESCE(excluded.factory_address,radar_enrichment_state.factory_address),router_address=COALESCE(excluded.router_address,radar_enrichment_state.router_address),quote_token=COALESCE(excluded.quote_token,radar_enrichment_state.quote_token),pair_status=excluded.pair_status,pair_source=COALESCE(excluded.pair_source,radar_enrichment_state.pair_source),pair_checked_at=excluded.pair_checked_at,pair_block_number=COALESCE(excluded.pair_block_number,radar_enrichment_state.pair_block_number),liquidity_usd=COALESCE(excluded.liquidity_usd,radar_enrichment_state.liquidity_usd),liquidity_source=COALESCE(excluded.liquidity_source,radar_enrichment_state.liquidity_source),liquidity_status=excluded.liquidity_status,liquidity_checked_at=excluded.liquidity_checked_at,data_conflict=excluded.data_conflict,unique_buyers_24h=COALESCE(excluded.unique_buyers_24h,radar_enrichment_state.unique_buyers_24h),unique_sellers_24h=COALESCE(excluded.unique_sellers_24h,radar_enrichment_state.unique_sellers_24h),buy_tx_24h=COALESCE(excluded.buy_tx_24h,radar_enrichment_state.buy_tx_24h),sell_tx_24h=COALESCE(excluded.sell_tx_24h,radar_enrichment_state.sell_tx_24h),activity_source=COALESCE(excluded.activity_source,radar_enrichment_state.activity_source),activity_status=excluded.activity_status,activity_window_start=excluded.activity_window_start,activity_window_end=excluded.activity_window_end,token_created_at=COALESCE(radar_enrichment_state.token_created_at,excluded.token_created_at),token_created_source=COALESCE(radar_enrichment_state.token_created_source,excluded.token_created_source),token_created_status=CASE WHEN radar_enrichment_state.token_created_status='VERIFIED' THEN radar_enrichment_state.token_created_status ELSE excluded.token_created_status END,pool_created_at=COALESCE(radar_enrichment_state.pool_created_at,excluded.pool_created_at),pool_created_source=COALESCE(radar_enrichment_state.pool_created_source,excluded.pool_created_source),pool_created_status=CASE WHEN radar_enrichment_state.pool_created_status='VERIFIED' THEN radar_enrichment_state.pool_created_status ELSE excluded.pool_created_status END,error_code=excluded.error_code,error_reason=excluded.error_reason,retry_count=excluded.retry_count,next_retry_at=excluded.next_retry_at,terminal=excluded.terminal,updated_at=excluded.updated_at`).bind(signalId, stateStatus, stage, avatar.avatar_original_url, avatar.avatar_resolved_url, avatar.avatar_source, avatar.avatar_checked_at, avatar.avatar_status, avatar.avatar_error_code, primary?.pairAddress || null, primary?.poolType || null, primary?.dexId || candidate.dexId || null, primary?.factoryAddress || null, primary?.routerAddress || null, primary?.quoteToken || null, pairStatus, primary?.source || null, now, primary?.blockNumber || null, liquidity, primary?.liquiditySource || (candidate.liquidity !== null ? candidate.source : null), conflict ? "DATA_CONFLICT" : liquidity !== null ? primary?.status === "VERIFIED" ? "VERIFIED" : "PENDING" : "UNAVAILABLE", now, conflict ? 1 : 0, activity.uniqueBuyers24h, activity.uniqueSellers24h, activity.buyTx24h, activity.sellTx24h, activity.uniqueBuyers24h !== null || activity.buyTx24h !== null ? "provider_aggregate" : null, activity.uniqueBuyers24h !== null || activity.buyTx24h !== null ? "VERIFIED" : "UNAVAILABLE", new Date(Date.now() - 86_400_000).toISOString(), now, tokenCreatedAt, tokenCreatedAt ? "provider_metadata" : null, tokenCreatedAt ? "VERIFIED" : "UNAVAILABLE", candidate.poolCreatedAt, candidate.poolCreatedAt ? candidate.source : null, candidate.poolCreatedAt ? "PENDING" : "UNAVAILABLE", candidate.firstSeenAt, error?.error_code || null, error?.error_reason || (pairStatus === "UNSUPPORTED_DEX" ? "该DEX尚无已核验注册表配置" : pairStatus === "RPC_ERROR" ? "未配置该链RPC，无法完成确定性验证" : null), attempt, error?.next_retry_at || null, stateStatus === "VERIFIED" || stateStatus === "UNSUPPORTED_DEX" ? 1 : 0, now),
    db.prepare(`UPDATE radar_signals SET pair_address=COALESCE(?,pair_address),factory_address=COALESCE(?,factory_address),router_id=COALESCE(?,router_id),identity_status=CASE WHEN ? IS NOT NULL THEN 'VERIFIED' ELSE identity_status END,liquidity=COALESCE(?,liquidity),buyers=COALESCE(?,buyers),sellers=COALESCE(?,sellers),pool_created_at=COALESCE(pool_created_at,?),updated_at=? WHERE id=?`).bind(primary?.pairAddress || null, primary?.factoryAddress || null, primary?.routerAddress || null, primary?.pairAddress || null, liquidity, activity.uniqueBuyers24h, activity.uniqueSellers24h, candidate.poolCreatedAt, now, signalId),
  ]);
  return { skipped: false, status: stateStatus, tradeDataStage: stage, pools: pools.length, verifiedPair: primary?.pairAddress || null, quoteBands: quotes.filter((row) => row.status === "VERIFIED").length };
}
