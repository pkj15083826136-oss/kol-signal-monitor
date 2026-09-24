export const EXCHANGES = ["binance", "coinbase", "upbit", "okx", "bybit", "kraken", "bitget", "gate", "mexc", "htx"] as const;
export type Exchange = typeof EXCHANGES[number];
export type ExchangeEventType = "first_spot_listing" | "spot_pair_add" | "contract_open" | "alpha_add" | "alpha_remove" | "launch_activity" | "token_delisting" | "pair_delisting";

export const EXCHANGE_LABELS: Record<Exchange, string> = { binance: "币安", coinbase: "Coinbase", upbit: "Upbit", okx: "OKX", bybit: "Bybit", kraken: "Kraken", bitget: "Bitget", gate: "Gate", mexc: "MEXC", htx: "HTX" };

export const PAIR_SOURCES: Record<Exchange, { spot: string; contract?: string }> = {
  binance: { spot: "https://api.binance.com/api/v3/exchangeInfo", contract: "https://fapi.binance.com/fapi/v1/exchangeInfo" },
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
  okx: "https://www.okx.com/help/category/announcements",
  bybit: "https://announcements.bybit.com/en/",
  kraken: "https://support.kraken.com/hc/en-us/sections/360012315212-new-coin-listings",
  bitget: "https://www.bitget.com/support/sections/12508313416907",
  gate: "https://www.gate.com/announcements",
  mexc: "https://www.mexc.com/support/categories/360000254192",
  htx: "https://www.htx.com/support/en-us/list/360000039942",
};

function clean(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
export function normalizePairs(exchange: Exchange, market: "spot" | "contract", payload: unknown): string[] {
  const body = payload as Record<string, any>;
  let rows: any[] = [];
  if (exchange === "binance" || exchange === "mexc") rows = Array.isArray(body?.symbols) ? body.symbols : market === "contract" && Array.isArray(body?.data) ? body.data : [];
  else if (exchange === "coinbase" || exchange === "gate") rows = Array.isArray(payload) ? payload as any[] : [];
  else if (exchange === "upbit") rows = Array.isArray(payload) ? payload as any[] : [];
  else if (exchange === "okx") rows = Array.isArray(body?.data) ? body.data : [];
  else if (exchange === "bybit") rows = Array.isArray(body?.result?.list) ? body.result.list : [];
  else if (exchange === "kraken") rows = Object.entries(body?.result || {}).map(([key, value]) => ({ key, ...(value as object) }));
  else if (exchange === "bitget") rows = Array.isArray(body?.data) ? body.data : [];
  else if (exchange === "htx") rows = Array.isArray(body?.data) ? body.data : [];
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

export function classifyAnnouncement(title: string): { eventType: ExchangeEventType; marketType: "spot" | "contract" | "activity" | "alpha" } | null {
  const t = title.toLowerCase();
  if (!/(list|trading support|trading pair|delist|remove|launchpad|launchpool|jumpstart|kickstarter|alpha|perpetual|futures|contract|상장|거래지원|마켓 추가|거래지원 종료)/i.test(title)) return null;
  if (/alpha/.test(t) && /(remove|delist|移除)/.test(t)) return { eventType: "alpha_remove", marketType: "alpha" };
  if (/alpha/.test(t)) return { eventType: "alpha_add", marketType: "alpha" };
  if (/(launchpad|launchpool|jumpstart|kickstarter|token sale|打新)/.test(t)) return { eventType: "launch_activity", marketType: "activity" };
  if (/(perpetual|futures|contract|swap)/.test(t) && /(launch|list|add|open|introduc|거래지원)/.test(t) && !/(delist|remove)/.test(t)) return { eventType: "contract_open", marketType: "contract" };
  if (/(delist|remov(e|al)|terminate|거래지원 종료)/.test(t)) return { eventType: /(pair|market|마켓|\/usdt|usdt)/.test(t) ? "pair_delisting" : "token_delisting", marketType: /(perpetual|futures|contract|swap)/.test(t) ? "contract" : "spot" };
  if (/(pair|market|마켓 추가)/.test(t)) return { eventType: "spot_pair_add", marketType: "spot" };
  if (/(will list|to list|new listing|trading support|상장|거래지원)/.test(t)) return { eventType: "first_spot_listing", marketType: "spot" };
  return null;
}

export function extractAnnouncementLinks(html: string, baseUrl: string) {
  const seen = new Set<string>(); const out: { id: string; title: string; url: string }[] = [];
  const decoded = html.replace(/\\u0026/g, "&").replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let match: RegExpExecArray | null;
  while ((match = re.exec(decoded)) && out.length < 80) {
    const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); const classified = classifyAnnouncement(title); if (!classified || title.length < 8 || /^(futures trading|spot trading|new coin listings?|delistings?|announcements?|trading support)$/i.test(title)) continue;
    let url: string; try { url = new URL(match[1], baseUrl).toString(); } catch { continue; }
    const target = new URL(url); const host = new URL(baseUrl).hostname;
    if (host.includes("okx.com") && (!target.pathname.startsWith("/help/") || target.pathname.includes("/category/"))) continue;
    if (host.includes("bybit.com") && !target.pathname.includes("/article/")) continue;
    if (host.includes("kraken") && (!target.hostname.startsWith("support.") || !target.pathname.includes("/articles/"))) continue;
    if (host.includes("bitget.com") && !target.pathname.includes("/support/articles/")) continue;
    if (host.includes("gate.com") && !target.pathname.includes("/announcements/article/")) continue;
    if (host.includes("mexc.com") && !target.pathname.includes("/announcements/article/")) continue;
    if (host.includes("htx.com") && !/\/support\/\d+/.test(target.pathname)) continue;
    if (host.includes("upbit.com") && !(target.pathname.includes("/service_center/notice") && target.searchParams.has("id"))) continue;
    const id = url.replace(/[?#].*$/, "").split("/").filter(Boolean).slice(-2).join(":"); if (seen.has(id)) continue; seen.add(id); out.push({ id, title, url });
  }
  return out;
}

export function extractBinanceAnnouncements(payload: unknown) {
  const catalogs = (payload as any)?.data?.catalogs;
  if (!Array.isArray(catalogs)) return [] as { id: string; title: string; url: string; announcedAt: string | null }[];
  return catalogs.flatMap((catalog: any) => Array.isArray(catalog.articles) ? catalog.articles : []).flatMap((article: any) => {
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
