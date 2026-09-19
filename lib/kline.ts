import type { KlineResult } from "@/lib/market";

export const KLINE_INTERVALS = [1, 5, 15, 60, 240, 1440] as const;
export type KlineInterval = typeof KLINE_INTERVALS[number];

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

export class KlineCache {
  private readonly values = new Map<KlineInterval, KlineResult>();

  constructor(initial?: Partial<Record<KlineInterval, KlineResult>>) {
    for (const interval of KLINE_INTERVALS) {
      const value = initial?.[interval];
      if (value) this.values.set(interval, value);
    }
  }

  get(interval: KlineInterval) { return this.values.get(interval); }
  set(interval: KlineInterval, value: KlineResult) { this.values.set(interval, value); }
  has(interval: KlineInterval) { return this.values.has(interval); }
}
