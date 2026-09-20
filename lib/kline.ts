import type { KlineResult } from "@/lib/market";

export const KLINE_INTERVALS = [1, 5, 15, 60, 240, 1440] as const;
export type KlineInterval = typeof KLINE_INTERVALS[number];

export function klineUnavailableReason(chain: string, interval: KlineInterval) {
  return ["sol", "bsc", "base", "robinhood"].includes(chain)
    ? `行情数据源暂未收录该代币的${KLINE_META[interval].label}K线，或上游暂时不可用。`
    : `该链暂不支持${KLINE_META[interval].label}K线。`;
}

export const KLINE_META: Record<KlineInterval, { label: string; window: string; limit: number; geckoUnit: "minute" | "hour" | "day"; geckoAggregate: number }> = {
  1: { label: "1分钟", window: "最近约8小时", limit: 480, geckoUnit: "minute", geckoAggregate: 1 },
  5: { label: "5分钟", window: "最近约10小时", limit: 120, geckoUnit: "minute", geckoAggregate: 5 },
  15: { label: "15分钟", window: "最近约30小时", limit: 120, geckoUnit: "minute", geckoAggregate: 15 },
  60: { label: "1小时", window: "最近约7天", limit: 168, geckoUnit: "hour", geckoAggregate: 1 },
  240: { label: "4小时", window: "最近约30天", limit: 180, geckoUnit: "hour", geckoAggregate: 4 },
  1440: { label: "1天", window: "最近约180天", limit: 180, geckoUnit: "day", geckoAggregate: 1 },
};

export function isKlineInterval(value: number): value is KlineInterval {
  return KLINE_INTERVALS.includes(value as KlineInterval);
}

export function normalizeKlineLimit(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.max(2, Math.min(500, Math.round(parsed)));
}

export function klinePollingDelay(interval: KlineInterval, hidden: boolean) {
  if (hidden) return 60_000;
  if (interval === 1) return 7_500;
  if (interval === 5 || interval === 15) return 12_000;
  return 25_000;
}

export function mergeCandles(current: KlineResult, incremental: KlineResult): KlineResult {
  if (!incremental.candles.length) return current;
  const merged = new Map(current.candles.map((candle) => [candle.time, candle]));
  for (const candle of incremental.candles) merged.set(candle.time, candle);
  return { candles: [...merged.values()].sort((a, b) => a.time - b.time), source: incremental.source || current.source, reason: "" };
}

export type KlineSeriesState = {
  historyBars: KlineResult["candles"];
  liveTailBars: KlineResult["candles"];
  mergedBars: KlineResult["candles"];
  source: string;
  reason: string;
  lastFullFetchAt: string | null;
  lastIncrementalFetchAt: string | null;
  isHistoryLoaded: boolean;
  isLive: boolean;
};

export function klineCacheKey(chain: string, tokenAddress: string, interval: KlineInterval) {
  const address = chain.toLowerCase() === "sol" ? tokenAddress : tokenAddress.toLowerCase();
  return `${chain.toLowerCase()}:${address}:${interval}`;
}

export class KlineCache {
  private readonly values = new Map<string, KlineSeriesState>();

  get(chain: string, address: string, interval: KlineInterval) {
    return this.values.get(klineCacheKey(chain, address, interval));
  }

  setHistory(chain: string, address: string, interval: KlineInterval, result: KlineResult, fetchedAt = new Date().toISOString()) {
    const key = klineCacheKey(chain, address, interval);
    const previous = this.values.get(key);
    const merged = previous?.liveTailBars.length
      ? mergeCandles(result, { candles: previous.liveTailBars, source: previous.source, reason: "" })
      : result;
    const next: KlineSeriesState = {
      historyBars: result.candles,
      liveTailBars: previous?.liveTailBars || [],
      mergedBars: merged.candles,
      source: result.source,
      reason: result.reason,
      lastFullFetchAt: fetchedAt,
      lastIncrementalFetchAt: previous?.lastIncrementalFetchAt || null,
      isHistoryLoaded: result.candles.length > 0,
      isLive: previous?.isLive || false,
    };
    this.values.set(key, next);
    return next;
  }

  mergeIncremental(chain: string, address: string, interval: KlineInterval, result: KlineResult, fetchedAt = new Date().toISOString()) {
    const key = klineCacheKey(chain, address, interval);
    const previous = this.values.get(key);
    if (!previous?.isHistoryLoaded || !result.candles.length) return previous;
    const merged = mergeCandles({ candles: previous.mergedBars, source: previous.source, reason: previous.reason }, result);
    const next: KlineSeriesState = {
      ...previous,
      liveTailBars: result.candles,
      mergedBars: merged.candles,
      source: merged.source,
      reason: merged.reason,
      lastIncrementalFetchAt: fetchedAt,
      isLive: true,
    };
    this.values.set(key, next);
    return next;
  }
}
