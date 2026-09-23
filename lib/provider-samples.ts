import type { BatchMarketItem } from "@/lib/batch-market";
import type { KlineInterval } from "@/lib/kline";
import type { KlineResult } from "@/lib/market";

export const PROVIDER_SAMPLE_UPSERT = `ON CONFLICT(source, chain, token_address, data_kind, interval, bucket) DO UPDATE SET
  observation_count = provider_samples.observation_count + 1,
  request_count = provider_samples.request_count + excluded.request_count,
  success = provider_samples.success + excluded.success,
  status = excluded.status,
  latency_ms = excluded.latency_ms,
  cache_hit = provider_samples.cache_hit + excluded.cache_hit,
  rate_limited = provider_samples.rate_limited + excluded.rate_limited,
  identity_verified = MIN(provider_samples.identity_verified, excluded.identity_verified),
  available_fields_json = excluded.available_fields_json,
  source_timestamp = COALESCE(excluded.source_timestamp, provider_samples.source_timestamp),
  captured_at = excluded.captured_at`;

function bucket15m(now: Date) { return new Date(Math.floor(now.getTime() / 900_000) * 900_000).toISOString(); }
function fields(item: BatchMarketItem) {
  return (["price", "priceChange24h", "marketCap", "liquidity", "volume24h", "holders"] as const).filter((field) => item[field] !== null && item[field] !== undefined && Number.isFinite(Number(item[field])));
}

export async function recordMarketSamples(db: D1Database | undefined, items: BatchMarketItem[], now = new Date()) {
  if (!db || !items.length) return;
  const bucket = bucket15m(now); const capturedAt = now.toISOString();
  await db.batch(items.map((item, index) => db.prepare(`INSERT INTO provider_samples
    (source, chain, token_address, data_kind, interval, bucket, observation_count, request_count, success, status, latency_ms, cache_hit, rate_limited, identity_verified, available_fields_json, source_timestamp, captured_at)
    VALUES (?, ?, ?, 'market', 0, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${PROVIDER_SAMPLE_UPSERT}`)
    .bind("okx", item.chain, item.address, bucket, index === 0 ? item.providerMeta?.requestCount ?? 0 : 0, item.source.includes("OKX") && item.identityVerified ? 1 : 0,
      item.providerMeta?.status ?? "unavailable", item.providerMeta?.latencyMs ?? 0, item.providerMeta?.cacheHit ? 1 : 0, item.providerMeta?.rateLimited ? 1 : 0,
      item.identityVerified ? 1 : 0, JSON.stringify(fields(item)), item.sourceTimestamp || null, capturedAt)));
}

export async function recordKlineSample(db: D1Database | undefined, chain: string, address: string, interval: KlineInterval, result: KlineResult, now = new Date()) {
  if (!db) return;
  const bucket = bucket15m(now); const meta = result.providerMeta;
  await db.prepare(`INSERT INTO provider_samples
    (source, chain, token_address, data_kind, interval, bucket, observation_count, request_count, success, status, latency_ms, cache_hit, rate_limited, identity_verified, available_fields_json, source_timestamp, captured_at)
    VALUES (?, ?, ?, 'kline', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${PROVIDER_SAMPLE_UPSERT}`)
    .bind("okx", chain, address, interval, bucket, meta?.requestCount ?? 0, result.source.startsWith("OKX") && result.candles.length ? 1 : 0,
      meta?.status ?? "unavailable", meta?.latencyMs ?? 0, meta?.cacheHit ? 1 : 0, meta?.rateLimited ? 1 : 0,
      result.source.startsWith("OKX") ? 1 : 0, JSON.stringify(result.candles.length ? ["ohlcv"] : []),
      result.candles.length ? new Date(result.candles[result.candles.length - 1].time * 1000).toISOString() : null, now.toISOString()).run();
}
