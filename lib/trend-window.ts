export type TrendSample = { capturedAt: string; holders: number; amount: number; value: number };
export type TrendPoint = Omit<TrendSample, "capturedAt"> & { time: number };
export type TrendChartPoint = { time: number; holders: number | null; amount: number | null; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildTrendWindow(samples: TrendSample[], now = Date.now()) {
  const cutoff = now - DAY_MS;
  const points = samples.flatMap((sample) => {
    const time = Date.parse(sample.capturedAt);
    return Number.isFinite(time) && time >= cutoff && time <= now && [sample.holders, sample.amount, sample.value].every(Number.isFinite)
      ? [{ time, holders: sample.holders, amount: sample.amount, value: sample.value }]
      : [];
  }).sort((a, b) => a.time - b.time);
  const first = Math.max(cutoff, points[0]?.time ?? now);
  const last = points.at(-1)?.time ?? first;
  const coverageMinutes = Math.max(0, Math.floor((last - first) / 60_000));
  const chartPoints: TrendChartPoint[] = [];
  for (const point of points) {
    const previous = chartPoints.at(-1);
    if (previous && point.time - previous.time > 15 * 60_000) chartPoints.push({ time: previous.time + 1, holders: null, amount: null, value: null });
    chartPoints.push(point);
  }
  return {
    points,
    chartPoints,
    ready: points.length >= 2,
    domain: [first, last] as [number, number],
    coverageLabel: `${Math.floor(coverageMinutes / 60)}小时${coverageMinutes % 60}分钟`,
  };
}
