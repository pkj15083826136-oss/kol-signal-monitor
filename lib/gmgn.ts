import { env } from "cloudflare:workers";

type JsonRecord = Record<string, unknown>;

function runtimeEnv(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

async function gmgnRequest(path: string, params: Record<string, string | number>) {
  const apiKey = runtimeEnv("GMGN_API_KEY");
  if (!apiKey) throw new Error("GMGN_API_KEY 未配置");
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Math.floor(Date.now() / 1000)),
    client_id: crypto.randomUUID(),
  });
  const response = await fetch(`https://openapi.gmgn.ai${path}?${query}`, {
    headers: { "X-APIKEY": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  const payload = (await response.json()) as { code?: number; data?: unknown; message?: string; error?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || payload.error || `GMGN HTTP ${response.status}`);
  }
  return payload.data;
}

export function getKolTrades(chain: string) {
  return gmgnRequest("/v1/user/kol", { chain, limit: 200 });
}

export function getSmartMoneyTrades(chain: string) {
  return gmgnRequest("/v1/user/smartmoney", { chain, limit: 200 });
}

export function getTokenInfo(chain: string, address: string) {
  return gmgnRequest("/v1/token/info", { chain, address });
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function asList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  const list = record.list ?? record.data ?? record.items;
  return Array.isArray(list) ? list.map(asRecord) : [];
}

export function firstString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function firstNumber(record: JsonRecord, keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

