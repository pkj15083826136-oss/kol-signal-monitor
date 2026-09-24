export const EXCHANGES = ["binance", "coinbase", "upbit", "okx", "bybit", "kraken", "bitget", "gate", "mexc", "htx"] as const;
export type Exchange = typeof EXCHANGES[number];
export type ExchangeEventType = "first_spot_listing" | "spot_pair_add" | "contract_open" | "alpha_add" | "alpha_remove" | "launch_activity" | "token_delisting" | "pair_delisting";

export const EXCHANGE_LABELS: Record<Exchange, string> = { binance: "币安", coinbase: "Coinbase", upbit: "Upbit", okx: "OKX", bybit: "Bybit", kraken: "Kraken", bitget: "Bitget", gate: "Gate", mexc: "MEXC", htx: "HTX" };

export const PAIR_SOURCES: Record<Exchange, { spot: string; contract?: string }> = {
  binance: { spot: "https://data-api.binance.vision/api/v3/exchangeInfo?showPermissionSets=false", contract: "https://fapi.binance.com/fapi/v1/exchangeInfo" },
  coinbase: { spot: "https://api.exchange.coinbase.com/products" },
  upbit: { spot: "https://api.upbit.com/v1/market/all?is_details=true" },
  okx: { spot: "https://www.okx.com/api/v5/public/instruments?instType=SPOT", contract: "https://www.okx.com/api/v5/public/instruments?instType=SWAP" },
  bybit: { spot: "https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000", contract: "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000" },
  kraken: { spot: "https://api.kraken.com/0/public/AssetPairs" },
  bitget: { spot: "https://api.bitget.com/api/v2/spot/public/symbols", contract: "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES" },
  gate: { spot: "https://api.gateio.ws/api/v4/spot/currency_pairs", contract: "https://api.gateio.ws/api/v4/futures/usdt/contracts" },
  mexc: { spot: "https://api.mexc.com/api/v3/exchangeInfo", contract: "https://contract.mexc.com/api/v1/contract/detail" },
  htx: { spot: "https://api.huobi.pro/v2/settings/common/symbols", contract: "https://api.hbdm.com/linear-swap-api/v1/swap_contract_info" },
};

export const ANNOUNCEMENT_SOURCES: Record<Exchange, string> = {
  binance: "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20",
  coinbase: "https://www.coinbase.com/blog/Coinbase-Markets-on-X-Your-New-Home-for-All-Listings",
  upbit: "https://upbit.com/service_center/notice",
  okx: "https://www.okx.com/en-us/help/section/announcements-new-listings",
  bybit: "https://announcements.bybit.com/en/",
  kraken: "https://blog.kraken.com/wp-json/wp/v2/posts?categories=1789&per_page=20&_fields=id,date_gmt,link,title",
  bitget: "https://api.bitget.com/api/v2/public/annoucements?language=en_US&limit=10",
  gate: "https://api.gateio.ws/api/v4/ann/list_article",
  mexc: "https://www.mexc.com/en-GB/announcements",
  htx: "https://www.htx.com/support/en-us/list/360000039942",
};

function clean(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function asRecords(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(asRecord) : []; }
export function normalizePairs(exchange: Exchange, market: "spot" | "contract", payload: unknown): string[] {
  const body = asRecord(payload);
  let rows: JsonRecord[] = [];
  if (exchange === "binance" || exchange === "mexc") rows = asRecords(body.symbols ?? (market === "contract" ? body.data : []));
  else if (exchange === "coinbase" || exchange === "gate" || exchange === "upbit") rows = asRecords(payload);
  else if (exchange === "okx" || exchange === "bitget" || exchange === "htx") rows = asRecords(body.data);
  else if (exchange === "bybit") rows = asRecords(asRecord(body.result).list);
  else if (exchange === "kraken") rows = Object.entries(asRecord(body.result)).map(([key, value]) => ({ key, ...asRecord(value) }));
  const pairs = rows.flatMap((row) => {
    const status = clean(row.status ?? row.state ?? row.trade_status ?? row.contract_status ?? "ONLINE");
    if (["OFFLINE", "CANCEL_ONLY", "SELL_ONLY", "DELISTED"].includes(status)) return [];
    const value = market === "contract" ? (row.contract_code ?? row.symbol ?? row.id ?? row.instId ?? row.name ?? row.key) : (row.symbol ?? row.id ?? row.market ?? row.instId ?? row.name ?? row.key ?? row.sc ?? row.symbolName);
    return value ? [clean(value).replace(/[\/_]/g, "-").replace(/-+/g, "-")] : [];
  });
  return [...new Set(pairs)].sort();
}

export function splitPair(pair: string) {
  const normalized = clean(pair).replace(/[\/_]/g, "-");
  if (normalized.includes("-")) { const parts = normalized.split("-"); return { base: parts[0], quote: parts[1] || "" }; }
  for (const quote of ["USDT", "USDC", "USD", "KRW", "EUR", "BTC", "ETH", "TRY", "BRL"]) if (normalized.endsWith(quote) && normalized.length > quote.length) return { base: normalized.slice(0, -quote.length), quote };
  return { base: normalized, quote: "" };
}

export function normalizeSuppliedPairs(values: unknown[]) {
  return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter((pair) => pair.length >= 3 && pair.length <= 60 && !/[\s\u0000-\u001f]/u.test(pair)))].sort();
}

export function reconcilePairSnapshot(previous: string[], current: string[], pendingMissing: Record<string, number> = {}, minimumRatio = 0.7) {
  const before = new Set(previous);
  const after = new Set(current);
  const ratio = previous.length ? current.length / previous.length : 1;
  if (previous.length && ratio < minimumRatio) return { suspect: true, ratio, added: [] as string[], removed: [] as string[], snapshot: previous, pendingMissing };
  const added = current.filter((pair) => !before.has(pair));
  const removed: string[] = [];
  const nextMissing: Record<string, number> = {};
  for (const pair of previous) {
    if (after.has(pair)) continue;
    const count = (pendingMissing[pair] || 0) + 1;
    if (count >= 2) removed.push(pair);
    else nextMissing[pair] = count;
  }
  const removedSet = new Set(removed);
  const snapshot = [...new Set([...previous.filter((pair) => !removedSet.has(pair)), ...current])].sort();
  return { suspect: false, ratio, added, removed, snapshot, pendingMissing: nextMissing };
}

export function classifyAnnouncement(title: string): { eventType: ExchangeEventType; marketType: "spot" | "contract" | "activity" | "alpha" } | null {
  const t = title.toLowerCase();
  if (/(tick size|fee group|maintenance margin|adjust(?:ment|s)? (?:to |the )?(?:leverage|position)|staking products?|crypto loan|websocket)/.test(t)) return null;
  if (/(?:margin trading pairs?|margin and loan|collateral)/.test(t) && !/(spot|perpetual|futures|contract)/.test(t)) return null;
  if (!/(list|add support|trading (?:support|pair|will begin|is live)|available for trading|delist|remove support|remove|launchpad|launchpool|jumpstart|kickstarter|alpha|perpetual|futures|contract|상장|거래지원|마켓 추가|거래지원 종료)/i.test(title)) return null;
  if (/(competition|prize pool|promotion|token splash|rewards?)/.test(t) && !/(will list|to list|listing of|launchpad|launchpool|token sale)/.test(t)) return null;
  if (/alpha/.test(t) && /(remove|delist|移除)/.test(t)) return { eventType: "alpha_remove", marketType: "alpha" };
  if (/alpha/.test(t) && /(will (?:add|list|include)|added to|listed on|include|introduc)/.test(t)) return { eventType: "alpha_add", marketType: "alpha" };
  if (/(launchpad|launchpool|jumpstart|kickstarter|token sale|打新)/.test(t)) return { eventType: "launch_activity", marketType: "activity" };
  if (/(perpetual|\bperps\b|futures|contract|swap)/.test(t) && /(launch|list|add|open|introduc|거래지원)/.test(t) && !/(delist|remove)/.test(t)) return { eventType: "contract_open", marketType: "contract" };
  if (/(delist|remov(e|al)|remove support|terminate|거래지원 종료)/.test(t)) return { eventType: /(pair|market|마켓|\/usdt|usdt)/.test(t) ? "pair_delisting" : "token_delisting", marketType: /(perpetual|\bperps\b|futures|contract|swap)/.test(t) ? "contract" : "spot" };
  if (/(pair|market|마켓 추가)/.test(t)) return { eventType: "spot_pair_add", marketType: "spot" };
  if (/(will list|to list|new listing|add support|trading (?:support|will begin|is live)|available for trading|상장|거래지원)/.test(t)) return { eventType: "first_spot_listing", marketType: "spot" };
  return null;
}

export function announcementTimeFromTitle(title: string, reference = new Date()) {
  const named = title.match(/(?:published on\s+)?([A-Z][a-z]{2,8})\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s|$)/);
  if (named) {
    const year = Number(named[3] || reference.getUTCFullYear());
    const parsed = new Date(`${named[1]} ${named[2]}, ${year} 00:00:00 UTC`);
    if (Number.isFinite(parsed.getTime())) { if (!named[3] && parsed.getTime() > reference.getTime() + 7 * 86_400_000) parsed.setUTCFullYear(year - 1); return parsed.toISOString(); }
  }
  const numeric = title.match(/\b(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*\(UTC\)/i);
  if (numeric) {
    const parsed = new Date(Date.UTC(reference.getUTCFullYear(), Number(numeric[1]) - 1, Number(numeric[2]), Number(numeric[3]), Number(numeric[4]), Number(numeric[5] || 0)));
    if (parsed.getTime() > reference.getTime() + 7 * 86_400_000) parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
    return parsed.toISOString();
  }
  return null;
}

export function extractAnnouncementLinks(html: string, baseUrl: string) {
  const seen = new Set<string>(); const out: { id: string; title: string; url: string; announcedAt: string | null }[] = [];
  const decoded = html.replace(/\\u0026/g, "&").replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let match: RegExpExecArray | null;
  while ((match = re.exec(decoded)) && out.length < 80) {
    const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); const classified = classifyAnnouncement(title); if (!classified || title.length < 8 || /^(futures trading|spot trading|new coin listings?|delistings?|announcements?|trading support)$/i.test(title)) continue;
    let url: string; try { url = new URL(match[1], baseUrl).toString(); } catch { continue; }
    const target = new URL(url); const host = new URL(baseUrl).hostname;
    if (host.includes("okx.com") && (!/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?help\//i.test(target.pathname) || target.pathname.includes("/category/") || target.pathname.includes("/section/"))) continue;
    if (host.includes("bybit.com") && !target.pathname.includes("/article/")) continue;
    if (host.includes("kraken") && !target.pathname.includes("/product/asset-listings/")) continue;
    if (host.includes("bitget.com") && !target.pathname.includes("/support/articles/")) continue;
    if (host.includes("gate.com") && !target.pathname.includes("/announcements/article/")) continue;
    if (host.includes("mexc.com") && !target.pathname.includes("/announcements/article/")) continue;
    if (host.includes("htx.com") && !/\/support\/\d+/.test(target.pathname)) continue;
    if (host.includes("upbit.com") && !(target.pathname.includes("/service_center/notice") && target.searchParams.has("id"))) continue;
    const id = url.replace(/[?#].*$/, "").split("/").filter(Boolean).slice(-2).join(":"); if (seen.has(id)) continue; seen.add(id); out.push({ id, title, url, announcedAt: announcementTimeFromTitle(title) });
  }
  return out;
}

export function extractBitgetAnnouncements(payload: unknown) {
  const rows = asRecords(asRecord(payload).data);
  return rows.flatMap((row) => {
    const title = String(row.annTitle || "").trim(); const id = String(row.annId || "").trim(); const url = String(row.annUrl || "").trim();
    if (!id || !url || !classifyAnnouncement(title)) return [];
    const date = new Date(Number(row.cTime || 0));
    return [{ id, title, url, announcedAt: Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : null }];
  });
}

export function extractGateAnnouncements(payload: unknown) {
  const rows = asRecords(asRecord(asRecord(payload).data).list);
  return rows.flatMap((row) => {
    const title = String(row.title || "").trim(); const id = String(row.id || "").trim(); if (!id || !classifyAnnouncement(title)) return [];
    const seconds = Number(row.release_timestamp || row.created_t || 0); const date = new Date(seconds * 1000);
    return [{ id, title, url: new URL(String(row.url || `/announcements/article/${id}`), "https://www.gate.com").toString(), announcedAt: Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : null }];
  });
}

export function extractCoinbaseXAnnouncements(payload: unknown) {
  const rows = asRecords(asRecord(payload).data);
  return rows.flatMap((row) => {
    const title = String(row.text || "").replace(/https:\/\/t\.co\/\S+/g, "").trim(); const id = String(row.id || "").trim(); if (!id || !classifyAnnouncement(title)) return [];
    const date = new Date(String(row.created_at || ""));
    return [{ id, title, url: `https://x.com/CoinbaseMarkets/status/${id}`, announcedAt: Number.isFinite(date.getTime()) ? date.toISOString() : null }];
  });
}

export function extractKrakenAnnouncements(payload: unknown) {
  return asRecords(payload).flatMap((row) => {
    const title = String(asRecord(row.title).rendered || "").replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const id = String(row.id || "").trim(); const url = String(row.link || "").trim();
    if (!id || !url || !classifyAnnouncement(title)) return [];
    const rawDate = String(row.date_gmt || row.date || ""); const date = new Date(rawDate && !/[zZ]|[+-]\d\d:\d\d$/.test(rawDate) ? `${rawDate}Z` : rawDate);
    return [{ id, title, url, announcedAt: Number.isFinite(date.getTime()) ? date.toISOString() : null }];
  });
}

export function extractBinanceAnnouncements(payload: unknown) {
  const catalogs = asRecords(asRecord(asRecord(payload).data).catalogs);
  return catalogs.flatMap((catalog) => asRecords(catalog.articles)).flatMap((article) => {
    const title = String(article.title || "").trim(); if (!classifyAnnouncement(title) || !article.code) return [];
    const date = new Date(Number(article.releaseDate || 0));
    return [{ id: String(article.id || article.code), title, url: `https://www.binance.com/en/support/announcement/${String(article.code)}`, announcedAt: Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : null }];
  });
}

export function eventPriority(type: ExchangeEventType, pairs: string[]) {
  if (["first_spot_listing", "token_delisting", "alpha_add", "alpha_remove", "launch_activity"].includes(type)) return "high";
  if (type === "pair_delisting" && pairs.some((pair) => /USDT/i.test(pair))) return "high";
  return type === "contract_open" ? "high" : "normal";
}

export function shouldAlertAnnouncement(lastSuccessAt: string | null, announcementAt: string | null) {
  if (!lastSuccessAt) return false;
  if (!announcementAt) return false;
  const previous = Date.parse(lastSuccessAt); const announced = Date.parse(announcementAt);
  return !Number.isFinite(previous) || !Number.isFinite(announced) || announced > previous;
}
