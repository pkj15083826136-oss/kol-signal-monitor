export type TrendSample = { capturedAt: string; holders: number; amount: number; value: number; coverage?: number | null; missingReason?: string | null; delta?: number | null };
export type TrendPoint = Omit<TrendSample, "capturedAt"> & { time: number };
export type TrendChartPoint = { time: number; holders: number | null; amount: number | null; value: number | null };
export type TrendSeriesPoint = { time: number; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildTrendWindow(samples: TrendSample[], now = Date.now()) {
  const cutoff = now - DAY_MS;
  const parsedTime = (value: string) => {
    const numeric = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : Number.NaN;
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    return Date.parse(value);
  };
  const byTime = new Map<number, TrendPoint>();
  for (const sample of samples) {
    const time = parsedTime(sample.capturedAt);
    if (!Number.isFinite(time) || time < cutoff || time > now) continue;
    const previous = byTime.get(time);
    byTime.set(time, {
      time,
      holders: Number.isFinite(sample.holders) ? sample.holders : previous?.holders ?? Number.NaN,
      amount: Number.isFinite(sample.amount) ? sample.amount : previous?.amount ?? Number.NaN,
      value: Number.isFinite(sample.value) ? sample.value : previous?.value ?? Number.NaN,
    });
  }
  const points = [...byTime.values()].sort((a, b) => a.time - b.time);
  const intervals = points.slice(1).map((point, index) => point.time - points[index].time).filter((value) => value > 0).sort((a, b) => a - b);
  const observedMedian = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 192_000;
  const samplingMs = observedMedian <= 15 * 60_000 ? observedMedian : 192_000;
  const gapThresholdMs = Math.max(192_000 * 3, samplingMs * 3);
  const metricSeries = (field: "holders" | "amount" | "value") => {
    const observed = points.filter((point) => Number.isFinite(point[field])).map((point) => ({ time: point.time, value: point[field] }));
    const series: TrendSeriesPoint[] = [];
    for (const point of observed) {
      const previous = series.at(-1);
      if (previous && point.time - previous.time > gapThresholdMs) series.push({ time: previous.time + 1, value: null });
      series.push(point);
    }
    return series;
  };
  const first = Math.max(cutoff, points[0]?.time ?? now);
  const last = points.at(-1)?.time ?? first;
  const coverageMinutes = Math.max(0, Math.floor((last - first) / 60_000));
  const coverageValues = samples.map((sample) => sample.coverage).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sampleCoverage = coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null;
  const missingReasons = [...new Set(samples.map((sample) => sample.missingReason).filter((value): value is string => Boolean(value)))];
  const series = { holders: metricSeries("holders"), amount: metricSeries("amount"), value: metricSeries("value") };
  const chartPoints: TrendChartPoint[] = points.map((point) => ({ time: point.time, holders: Number.isFinite(point.holders) ? point.holders : null, amount: Number.isFinite(point.amount) ? point.amount : null, value: Number.isFinite(point.value) ? point.value : null }));
  return {
    points,
    chartPoints,
    series,
    ready: Object.values(series).some((values) => values.filter((point) => point.value !== null).length >= 2),
    domain: [first, last] as [number, number],
    coverageLabel: `${Math.floor(coverageMinutes / 60)}小时${coverageMinutes % 60}分钟`,
    samplingLabel: `${Math.floor(samplingMs / 60_000)}分${Math.round((samplingMs % 60_000) / 1000)}秒`,
    sampleCoverage,
    missingReasons,
    gapThresholdMs,
  };
}
