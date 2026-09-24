import { classifyAnnouncement, type Exchange, type ExchangeEventType } from "@/lib/exchange-intelligence";

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const asRecords = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(asRecord) : [];
const supported = new Set<Exchange>(["coinbase", "upbit"]);

export type ThirdPartyListingEvent = {
  exchange: "coinbase" | "upbit";
  eventType: ExchangeEventType;
  marketType: string;
  title: string;
  sourceUrl: string;
  assets: string[];
  pairs: string[];
  detectedAt: string | null;
  sentAt: string | null;
};

function microsToIso(value: unknown) {
  const micros = Number(value);
  if (!Number.isFinite(micros) || micros <= 0) return null;
  const date = new Date(micros / 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function classificationToEvent(event: string, marketType: string, title: string) {
  if (event === "listing") {
    if (marketType === "futures" || marketType === "perpetual" || marketType === "contract") return { eventType: "contract_open" as const, marketType: "contract" };
    if (marketType === "spot") return { eventType: "first_spot_listing" as const, marketType: "spot" };
  }
  if (event === "delisting") return classifyAnnouncement(title) || { eventType: marketType === "spot" ? "pair_delisting" as const : "token_delisting" as const, marketType: marketType || "unknown" };
  return classifyAnnouncement(title);
}

/** Normalize the documented New Listings Feed v2/full format only.
 * The provider is discovery metadata, never an official announcement source.
 */
export function normalizeNewListingsFeed(input: unknown): ThirdPartyListingEvent | null {
  const raw = asRecord(input);
  const parser = asRecord(raw.parser);
  const exchange = String(parser.exchange || "").toLowerCase() as Exchange;
  if (!supported.has(exchange)) return null;
  const url = String(raw.url || "").trim();
  if (!/^https:\/\//i.test(url)) return null;
  if (exchange === "coinbase" && !/^https:\/\/(?:www\.)?(?:x\.com\/CoinbaseMarkets\/status\/|coinbase\.com\/)/i.test(url)) return null;
  if (exchange === "upbit" && !/^https:\/\/(?:www\.)?upbit\.com\/service_center\/notice/i.test(url)) return null;
  const content = asRecord(raw.content);
  const title = String(content.title || content.text || parser.display || "").trim();
  if (!title) return null;
  const classification = asRecord(parser.classification);
  const event = String(classification.event || "").toLowerCase();
  const type = String(classification.type || "").toLowerCase();
  const kind = classificationToEvent(event, type, title);
  if (!kind) return null;
  const assets = [...new Set(asRecords(parser.assets).map((asset) => String(asset.symbol || "").trim().toUpperCase()).filter(Boolean))];
  const markets = Array.isArray(classification.markets) ? classification.markets.map((market) => String(market).trim().toUpperCase()).filter(Boolean) : [];
  const pairs = exchange === "upbit" ? assets.flatMap((asset) => markets.map((market) => `${market}-${asset}`)) : assets.map((asset) => `${asset}-USD`);
  return {
    exchange: exchange as "coinbase" | "upbit",
    eventType: kind.eventType,
    marketType: kind.marketType,
    title,
    sourceUrl: url,
    assets,
    pairs,
    detectedAt: microsToIso(raw.detected_time_us),
    sentAt: microsToIso(raw.sent_time_us),
  };
}

export function normalizeNewListingsFeedBatch(values: unknown) {
  return (Array.isArray(values) ? values : [values]).flatMap((value) => {
    const event = normalizeNewListingsFeed(value);
    return event ? [event] : [];
  });
}
