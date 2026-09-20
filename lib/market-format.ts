const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function formatUsdCompact(value: number | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000 ? "compact" : "standard",
    minimumFractionDigits: value >= 1_000 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function tokenPricePrecision(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value === null || value === undefined || value <= 0) return 2;
  if (value >= 1_000) return 2;
  if (value >= 1) return 4;
  if (value >= 0.01) return 6;
  if (value >= 0.0001) return 8;
  return 12;
}

export function tokenPriceScale(value: number | null | undefined) {
  const precision = tokenPricePrecision(value);
  return { precision, minMove: 10 ** -precision };
}

function formatTokenNumber(value: number, grouping: boolean): string {
  return value.toLocaleString("en-US", {
    useGrouping: grouping,
    minimumFractionDigits: 0,
    maximumFractionDigits: tokenPricePrecision(value),
  });
}

export function formatTokenPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "--";
  if (value === 0) return "$0";
  return `$${formatTokenNumber(value, value >= 1_000)}`;
}

export function formatTokenQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "--";
  if (value === 0) return "0";
  return formatTokenNumber(value, value >= 1_000);
}

export function formatShanghaiDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function formatShanghaiTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatSignalAge(createdAt: string, now = Date.now()): string {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return "--";
  const minutes = Math.max(0, Math.floor((now - created) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}小时前`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}天前`;
  return formatShanghaiDateTime(createdAt);
}
