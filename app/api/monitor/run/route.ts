import { env } from "cloudflare:workers";
import { getKolTrades, getSmartMoneyTrades, getTokenInfo, asList, asRecord, firstNumber, firstString } from "@/lib/gmgn";
import { analyzeNarrative, type NarrativeResult } from "@/lib/xai";
import { sendWeComAlert } from "@/lib/wecom";
import { watchedByAddress } from "@/lib/wallets";
import { getMarketData } from "@/lib/market";
import { assessFirstSignal } from "@/lib/signal-policy";
import { isMonitorAuthorized, isMonitorPaused } from "@/lib/monitor-auth";
import { ALERT_THRESHOLDS, dueAlertThreshold, normalizeAddress } from "@/lib/monitor-policy";
import { d1Bindings, d1Integer, d1Json, d1Number, d1Text, SIGNAL_MARKET_UPDATE_SQL, signalMarketUpdateBindings } from "@/lib/d1-values";
import { deliverReadyAlerts, type AlertStore } from "@/lib/alert-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAINS = ["sol", "bsc", "base", "robinhood"] as const;
const CHAIN_LABEL: Record<string, string> = { sol: "Solana", bsc: "BSC", base: "Base", robinhood: "Robinhood" };
const IGNORED_TOKENS: Record<string, Set<string>> = {
  sol: new Set([
    "so11111111111111111111111111111111111111112",
    "epjfwdd5aufqssqmhbqnsnxzybapc8g4wgegktwytdt1v",
  ]),
  bsc: new Set([
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    "0x55d398326f99059ff775485246999027b3197955",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  ]),
  base: new Set([
    "0x4200000000000000000000000000000000000006",
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  ]),
  robinhood: new Set(),
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Trade = {
  id: string;
  chain: string;
  wallet: string;
  walletName: string;
  token: string;
  side: "buy" | "sell";
  usd: number;
  amount: number;
  at: string;
  raw: Record<string, unknown>;
};

function secret() {
  const value = (env as unknown as Record<string, unknown>).MONITOR_SECRET;
  return typeof value === "string" ? value : "";
}

function authorized(request: Request) {
  return isMonitorAuthorized(request, secret());
}

function write(db: D1Database, sql: string, name: string, fields: Record<string, string | number | null>) {
  return db.prepare(sql).bind(...d1Bindings(name, fields));
}

async function recordSourceHealth(db: D1Database, source: string, chain: string, ok: boolean, latencyMs: number, error = "", forcedStatus?: "healthy" | "rate_limited" | "degraded" | "unavailable") {
  const now = new Date().toISOString();
  const rateLimited = /429|rate.?limit|too many/i.test(error);
  const status = forcedStatus ?? (ok ? "healthy" : rateLimited ? "rate_limited" : "degraded");
  const nextRetryAt = ok ? null : new Date(Date.now() + (rateLimited ? 15 * 60_000 : 60_000)).toISOString();
  await write(db, `INSERT INTO source_health
    (source, chain, status, last_attempt_at, last_success_at, last_failure_at, consecutive_failures, last_latency_ms, last_error, next_retry_at, impact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, chain) DO UPDATE SET
      status = excluded.status,
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = CASE WHEN excluded.status = 'healthy' THEN excluded.last_success_at ELSE source_health.last_success_at END,
      last_failure_at = CASE WHEN excluded.status != 'healthy' THEN excluded.last_failure_at ELSE source_health.last_failure_at END,
      consecutive_failures = CASE WHEN excluded.status = 'healthy' THEN 0 ELSE source_health.consecutive_failures + 1 END,
      last_latency_ms = excluded.last_latency_ms,
      last_error = excluded.last_error, next_retry_at = excluded.next_retry_at, impact = excluded.impact`, "source_health.upsert", {
      source: d1Text(source), chain: d1Text(chain), status, last_attempt_at: now,
      last_success_at: ok ? now : null, last_failure_at: ok ? null : now, consecutive_failures: ok ? 0 : 1,
      last_latency_ms: d1Integer(latencyMs), last_error: ok ? null : d1Text(error).slice(0, 500),
      next_retry_at: nextRetryAt, impact: ok ? "none" : source.includes("market") ? "first_signal_gate" : "ingestion_degraded",
    }).run();
}

async function recordMarketReview(db: D1Database, chain: string, token: string, market: Awaited<ReturnType<typeof getMarketData>>, status: "suppressed" | "data_review", reason: string) {
  await write(db, `INSERT INTO market_reviews
    (chain, token_address, status, reason, market_cap, market_cap_source, market_data_conflict, source_values_json, holder_count, holder_source, token_created_at, identity_verified, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chain, token_address) DO UPDATE SET status=excluded.status, reason=excluded.reason, market_cap=excluded.market_cap,
      market_cap_source=excluded.market_cap_source, market_data_conflict=excluded.market_data_conflict, source_values_json=excluded.source_values_json,
      holder_count=COALESCE(excluded.holder_count, market_reviews.holder_count), holder_source=COALESCE(excluded.holder_source, market_reviews.holder_source),
      token_created_at=excluded.token_created_at, identity_verified=excluded.identity_verified, last_checked_at=excluded.last_checked_at`, "market_reviews.upsert", {
    chain: d1Text(chain), token_address: d1Text(token), status, reason,
    market_cap: market.filterMarketCap, market_cap_source: market.marketCapSource,
    market_data_conflict: market.marketDataConflict ? 1 : 0, source_values_json: d1Json(market.marketCapCandidates, {}),
    holder_count: market.holders, holder_source: market.holderSource,
    token_created_at: market.createdAt ? new Date(market.createdAt).toISOString() : null,
    identity_verified: market.identityVerified ? 1 : 0, last_checked_at: new Date().toISOString(),
  }).run();
}

async function deliverAlerts(db: D1Database) {
  const store: AlertStore = {
    async listReady(now) {
      const rows = await db.prepare(`SELECT id, alert_payload_json, alert_attempts FROM signals
        WHERE alert_status IN ('pending','retry') AND (alert_next_attempt_at IS NULL OR alert_next_attempt_at <= ?)
        ORDER BY id LIMIT 10`).bind(now).all<{ id: number; alert_payload_json: string; alert_attempts: number }>();
      return rows.results.flatMap((row) => {
        try { return [{ id: row.id, payload: JSON.parse(row.alert_payload_json) as Record<string, unknown>, attempts: row.alert_attempts }]; }
        catch { return [{ id: row.id, payload: { __invalidAlertPayload: true }, attempts: row.alert_attempts }]; }
      });
    },
    async claim(id, now) {
      const result = await write(db, `UPDATE signals SET alert_status = 'sending', alert_attempts = alert_attempts + 1,
        alert_last_attempt_at = ?, alert_error = NULL WHERE id = ? AND alert_status IN ('pending','retry')`, "alerts.claim", {
        alert_last_attempt_at: d1Text(now), id: d1Integer(id),
      }).run();
      return result.meta.changes === 1;
    },
    async markSent(id, now) {
      await write(db, "UPDATE signals SET alert_status = 'sent', alert_sent_at = ?, alert_next_attempt_at = NULL, alert_error = NULL WHERE id = ? AND alert_status = 'sending'", "alerts.sent", {
        alert_sent_at: d1Text(now), id: d1Integer(id),
      }).run();
    },
    async markFailed(id, error, status, nextAttemptAt) {
      await write(db, "UPDATE signals SET alert_status = ?, alert_error = ?, alert_next_attempt_at = ? WHERE id = ? AND alert_status = 'sending'", "alerts.failed", {
        alert_status: d1Text(status), alert_error: d1Text(error), alert_next_attempt_at: nextAttemptAt, id: d1Integer(id),
      }).run();
    },
  };
  return deliverReadyAlerts(store, async (payload) => {
    if (payload.__invalidAlertPayload) throw new Error("alert_payload_json 无法解析");
    await sendWeComAlert(payload);
  });
}

function nested(record: Record<string, unknown>, key: string) {
  return asRecord(record[key]);
}

function parseTrade(chain: string, row: Record<string, unknown>, source: "kol" | "smartmoney"): Trade | null {
  const makerInfo = nested(row, "maker_info");
  const tokenInfo = asRecord(row.token ?? row.token_info ?? row.base_token);
  const wallet = firstString(row, ["maker", "wallet_address", "address", "owner"]) || firstString(makerInfo, ["address", "wallet_address"]);
  const watched = watchedByAddress.get(`${CHAIN_LABEL[chain].toLowerCase()}:${normalizeAddress(chain, wallet)}`);
  // The fixed GMGN + Ave list remains the core pool. GMGN's KOL feed is also
  // accepted dynamically so the monitor follows the live KOL badges shown on
  // each token page instead of silently dropping newly-labelled KOL wallets.
  if (!watched && source !== "kol") return null;
  const token = firstString(row, ["token_address", "base_address", "base_token_address", "contract_address", "mint", "address"]) || firstString(tokenInfo, ["address", "token_address", "contract_address", "mint"]);
  if (!token || normalizeAddress(chain, token) === normalizeAddress(chain, wallet)) return null;
  if (IGNORED_TOKENS[chain]?.has(token.toLowerCase())) return null;
  const rawSide = firstString(row, ["side", "event_type", "type", "action"]).toLowerCase();
  const side = rawSide.includes("buy") ? "buy" : rawSide.includes("sell") ? "sell" : null;
  if (!side) return null;
  const unix = firstNumber(row, ["timestamp", "block_timestamp", "created_at", "time"]);
  const at = unix > 1e12 ? new Date(unix).toISOString() : unix > 1e9 ? new Date(unix * 1000).toISOString() : new Date().toISOString();
  const hash = firstString(row, ["tx_hash", "transaction_hash", "signature", "hash"]);
  const usd = firstNumber(row, ["amount_usd", "usd_value", "value_usd", "volume_usd"]);
  const amount = firstNumber(row, ["token_amount", "amount", "base_amount", "amount_out"]);
  return {
    id: hash ? `${hash}:${token}:${side}` : `${chain}:${wallet}:${token}:${side}:${unix || firstString(row, ["id"])}`,
    chain,
    wallet: normalizeAddress(chain, wallet),
    walletName: watched?.name || firstString(makerInfo, ["twitter_name", "twitter_username"]) || "GMGN动态KOL",
    token: normalizeAddress(chain, token),
    side,
    usd,
    amount,
    at,
    raw: row,
  };
}

function unwrapTokenInfo(value: unknown) {
  const root = asRecord(value);
  return asRecord(root.token ?? root.token_info ?? root);
}

function formatMoney(value: number) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
}

async function latestNarrative(db: D1Database, chain: string, token: string): Promise<NarrativeResult | null> {
  const signal = await db.prepare("SELECT id, ai_analysis, gmgn_theme FROM signals WHERE chain = ? AND token_address = ? ORDER BY alerted_at DESC LIMIT 1").bind(chain, token).first<{ id: number; ai_analysis: string; gmgn_theme: string }>();
  if (!signal) return null;
  const rows = await db.prepare("SELECT rank, author, posted_at, url, original, chinese, engagement FROM hot_posts WHERE signal_id = ? ORDER BY rank").bind(signal.id).all<Record<string, unknown>>();
  return {
    aiAnalysis: signal.ai_analysis,
    projectIntro: signal.gmgn_theme,
    raw: "",
    posts: rows.results.map((row) => ({
      rank: Number(row.rank), author: String(row.author), postedAt: String(row.posted_at ?? ""), url: String(row.url),
      original: String(row.original), chinese: String(row.chinese), engagement: String(row.engagement ?? ""),
    })),
  };
}

type SuppliedFeeds = { kol?: unknown; smartmoney?: unknown; health?: Partial<Record<"kol" | "smartmoney", { latencyMs?: number }>> };

async function runMonitor(selectedChain: typeof CHAINS[number], supplied?: SuppliedFeeds) {
  const db = env.DB;
  if (!db) throw new Error("DB binding 未配置");
  const startedAt = new Date().toISOString();
  let newTrades = 0;
  let newSignals = 0;
  let fetchedRows = 0;
  let matchedRows = 0;
  let dataReviewCount = 0;
  let marketConflictCount = 0;
  let feedErrors: string[] = [];
  const touched = new Map<string, { chain: string; token: string }>();
  try {
    const alertDeliveryBefore = await deliverAlerts(db);
    const feeds: Array<{ chain: string; kind: "kol" | "smartmoney"; data: unknown; error: string }> = [];
    if (supplied) {
      feeds.push({ chain: selectedChain, kind: "kol", data: supplied.kol ?? { list: [] }, error: "" });
      feeds.push({ chain: selectedChain, kind: "smartmoney", data: supplied.smartmoney ?? { list: [] }, error: "" });
      await recordSourceHealth(db, "gmgn_kol", selectedChain, true, d1Integer(supplied.health?.kol?.latencyMs));
      await recordSourceHealth(db, "gmgn_smartmoney", selectedChain, true, d1Integer(supplied.health?.smartmoney?.latencyMs));
    } else {
      for (const chain of [selectedChain]) {
        for (const [kind, getter] of [["kol", getKolTrades], ["smartmoney", getSmartMoneyTrades]] as const) {
          const feedStarted = Date.now();
          try {
            feeds.push({ chain, kind, data: await getter(chain), error: "" });
            await recordSourceHealth(db, `gmgn_${kind}`, chain, true, Date.now() - feedStarted);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            feeds.push({ chain, kind, data: { list: [] }, error: `${kind}:${chain}:${message}` });
            await recordSourceHealth(db, `gmgn_${kind}`, chain, false, Date.now() - feedStarted, message);
          }
          await pause(2000);
        }
      }
    }
    feedErrors = feeds.map((feed) => feed.error).filter(Boolean);
    fetchedRows = feeds.reduce((sum, feed) => sum + asList(feed.data).length, 0);
    const parsed = feeds
      .flatMap(({ chain, kind, data }) => asList(data).map((row) => parseTrade(chain, row, kind)).filter((row): row is Trade => Boolean(row)))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    matchedRows = parsed.length;

    for (const trade of parsed) {
      const inserted = await write(db, `INSERT OR IGNORE INTO trades
        (id, chain, wallet_address, wallet_name, token_address, side, amount_usd, token_amount, traded_at, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, "trades.insert", {
          id: d1Text(trade.id), chain: d1Text(trade.chain), wallet_address: d1Text(trade.wallet), wallet_name: d1Text(trade.walletName),
          token_address: d1Text(trade.token), side: d1Text(trade.side), amount_usd: d1Integer(trade.usd), token_amount: d1Text(trade.amount),
          traded_at: d1Text(trade.at), raw_json: d1Json(trade.raw),
        }).run();
      if (!inserted.meta.changes) continue;
      newTrades += 1;
      const existing = await db.prepare("SELECT balance, buy_usd, first_buy_at FROM token_wallets WHERE chain = ? AND token_address = ? AND wallet_address = ?")
        .bind(trade.chain, trade.token, trade.wallet).first<{ balance: number; buy_usd: number; first_buy_at: string }>();
      const signedAmount = trade.side === "buy" ? trade.amount : -trade.amount;
      const balance = Math.max(0, Number(existing?.balance || 0) + signedAmount);
      if (existing) {
        await write(db, "UPDATE token_wallets SET wallet_name = ?, last_buy_at = ?, buy_usd = ?, balance = ? WHERE chain = ? AND token_address = ? AND wallet_address = ?", "token_wallets.update", {
          wallet_name: d1Text(trade.walletName), last_buy_at: d1Text(trade.at), buy_usd: d1Integer(Number(existing.buy_usd || 0) + (trade.side === "buy" ? trade.usd : 0)),
          balance: d1Number(balance), chain: d1Text(trade.chain), token_address: d1Text(trade.token), wallet_address: d1Text(trade.wallet),
        }).run();
      } else if (trade.side === "buy") {
        await write(db, "INSERT INTO token_wallets (chain, token_address, wallet_address, wallet_name, first_buy_at, last_buy_at, buy_usd, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "token_wallets.insert", {
          chain: d1Text(trade.chain), token_address: d1Text(trade.token), wallet_address: d1Text(trade.wallet), wallet_name: d1Text(trade.walletName),
          first_buy_at: d1Text(trade.at), last_buy_at: d1Text(trade.at), buy_usd: d1Integer(trade.usd), balance: d1Number(balance),
        }).run();
      }
      touched.set(`${trade.chain}:${trade.token}`, { chain: trade.chain, token: trade.token });
    }

    // Reconcile recent qualifying tokens on every pass. This closes the gap
    // where a sixth wallet was persisted in an earlier pass but the signal
    // step did not complete, and it lets the next pass repair the alert.
    const qualifying = await db.prepare(`SELECT chain, token_address
      FROM token_wallets
      WHERE chain = ? AND balance > 0.000001 AND datetime(last_buy_at) >= datetime('now', '-6 hours')
      GROUP BY chain, token_address
      HAVING COUNT(*) >= ?`)
      .bind(selectedChain, ALERT_THRESHOLDS[0]).all<{ chain: string; token_address: string }>();
    for (const row of qualifying.results) {
      touched.set(`${row.chain}:${row.token_address}`, { chain: row.chain, token: row.token_address });
    }
    // Keep recently alerted tokens sampled even when no new KOL trade arrives,
    // so flat holdings, price-only changes and later exits remain visible.
    const activeSignals = await db.prepare(`SELECT DISTINCT chain, token_address FROM signals
      WHERE chain = ? AND datetime(alerted_at) >= datetime('now', '-48 hours')
      ORDER BY alerted_at DESC LIMIT 30`).bind(selectedChain).all<{ chain: string; token_address: string }>();
    for (const row of activeSignals.results) {
      touched.set(`${row.chain}:${row.token_address}`, { chain: row.chain, token: row.token_address });
    }

    for (const { chain, token } of touched.values()) {
      const aggregate = await db.prepare("SELECT COUNT(*) holder_count, COALESCE(SUM(buy_usd),0) total_buy_usd, COALESCE(SUM(balance),0) total_token_amount FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0.000001")
        .bind(chain, token).first<{ holder_count: number; total_buy_usd: number; total_token_amount: number }>();
      const holderCount = Number(aggregate?.holder_count || 0);
      const alertedRows = await db.prepare("SELECT threshold FROM signals WHERE chain = ? AND token_address = ?").bind(chain, token).all<{ threshold: number }>();
      const due = dueAlertThreshold(holderCount, alertedRows.results.map((row) => Number(row.threshold)));
      const previousSignal = await db.prepare("SELECT id, price FROM signals WHERE chain = ? AND token_address = ? ORDER BY alerted_at DESC LIMIT 1").bind(chain, token).first<{ id: number; price: string }>();
      if (!previousSignal && holderCount < ALERT_THRESHOLDS[0]) continue;
      // Ave CU is used once for a token's first signal; routine snapshots use
      // public market feeds so continuous monitoring does not burn the quota.
      const liveMarket = await getMarketData(chain, token, { useAve: !previousSignal }).catch(() => null);
      if (liveMarket) {
        for (const [source, status] of Object.entries(liveMarket.sourceStatus)) {
          await recordSourceHealth(db, `market_${source}`, chain, status === "healthy", 0, status === "healthy" ? "" : status, status);
        }
      }
      if (!previousSignal) {
        const decision = liveMarket ? assessFirstSignal({
          symbol: liveMarket.symbol, chain, address: token, marketCap: liveMarket.filterMarketCap,
          createdAt: liveMarket.createdAt || null, identityVerified: liveMarket.identityVerified, marketDataConflict: liveMarket.marketDataConflict,
        }) : { status: "data_review" as const, reason: "market_data_unavailable" };
        if (decision.status !== "allow") {
          if (decision.status === "data_review") dataReviewCount += 1;
          if (decision.reason === "market_data_conflict") marketConflictCount += 1;
          if (liveMarket) await recordMarketReview(db, chain, token, liveMarket, decision.status, decision.reason);
          continue;
        }
      }
      const price = liveMarket?.price || Number(previousSignal?.price || 0);
      await write(db, "INSERT INTO snapshots (chain, token_address, holder_count, total_buy_usd, total_token_amount, market_value, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)", "snapshots.insert", {
        chain: d1Text(chain), token_address: d1Text(token), holder_count: d1Integer(holderCount), total_buy_usd: d1Integer(aggregate?.total_buy_usd),
        total_token_amount: d1Number(aggregate?.total_token_amount), market_value: d1Number(Number(aggregate?.total_token_amount || 0) * price), captured_at: new Date().toISOString(),
      }).run();
      if (previousSignal && liveMarket) {
        await db.prepare(SIGNAL_MARKET_UPDATE_SQL).bind(...signalMarketUpdateBindings(liveMarket, chain, token)).run();
      }
      if (!due) continue;
      // Narrative search is the slowest part of a signal. Generate at most one
      // new alert per pass; remaining qualifying tokens are picked up by the
      // reconciliation query on the next pass instead of stalling ingestion.
      if (newSignals >= 1) continue;

      const latestTrade = await db.prepare("SELECT raw_json FROM trades WHERE chain = ? AND token_address = ? ORDER BY traded_at DESC LIMIT 1")
        .bind(chain, token).first<{ raw_json: string }>();
      let tradeRaw: Record<string, unknown> = {};
      try { tradeRaw = asRecord(JSON.parse(latestTrade?.raw_json || "{}")); } catch { tradeRaw = {}; }
      const tradeToken = asRecord(tradeRaw.base_token ?? tradeRaw.token ?? tradeRaw.token_info);
      const infoValue = await getTokenInfo(chain, token).catch(() => ({}));
      const info = unwrapTokenInfo(infoValue);
      const currentPrice = liveMarket?.price || firstNumber(info, ["price", "price_usd"]) || firstNumber(tradeRaw, ["price_usd", "price"]);

      const symbol = liveMarket?.symbol || firstString(info, ["symbol", "token_symbol"]) || firstString(tradeToken, ["symbol", "token_symbol"]) || "—";
      const name = liveMarket?.name || firstString(info, ["name", "token_name"]) || firstString(tradeToken, ["name", "token_name"]) || symbol;
      const marketCap = liveMarket?.marketCap || firstNumber(info, ["market_cap", "marketcap"]);
      const liquidity = liveMarket?.liquidity || firstNumber(info, ["liquidity", "liquidity_usd"]);
      const holders = liveMarket?.holders ?? firstNumber(info, ["holder_count", "holders"]);
      const volume24h = liveMarket?.volume24h || firstNumber(info, ["volume_24h", "volume24h", "swap_volume_24h"]);
      const launchpad = firstString(tradeToken, ["launchpad"]);
      const officialDescription = liveMarket?.description || firstString(info, ["description", "bio"]);
      let gmgnTheme = firstString(info, ["narrative", "theme"]);
      let narrative = (due === 6 || due === 38) ? await analyzeNarrative({ chain, address: token, symbol, name }).catch(() => null) : await latestNarrative(db, chain, token);
      if (!narrative) narrative = { projectIntro: "", aiAnalysis: "社媒有效信息不足，暂未形成清晰叙事。", posts: [], raw: "" };
      if (!gmgnTheme) gmgnTheme = launchpad ? `由 ${launchpad} 发行；暂无可核验的官方项目简介。` : "暂无可核验的官方项目简介。";
      const walletRows = await db.prepare("SELECT wallet_name FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0.000001 ORDER BY first_buy_at LIMIT 80").bind(chain, token).all<{ wallet_name: string }>();
      const walletNames = walletRows.results.map((row) => row.wallet_name);
      const alertPayload = {
        name, symbol, chain: CHAIN_LABEL[chain], address: token, holderCount,
        marketCap: formatMoney(marketCap), liquidity: formatMoney(liquidity), holders, volume24h: formatMoney(volume24h),
        gmgnTheme, aiAnalysis: narrative.aiAnalysis, walletNames, detailUrl: "",
      };
      const inserted = await write(db, `INSERT INTO signals
        (chain, token_address, name, symbol, logo, threshold, holder_count, market_cap, liquidity, holders, volume_24h, price, gmgn_theme, official_description, description_source, description_updated_at, ai_analysis, wallet_names_json, alerted_at, alert_status, alert_attempts, alert_payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`, "signals.insert", {
        chain: d1Text(chain), token_address: d1Text(token), name: d1Text(name, "Unknown"), symbol: d1Text(symbol, "—"),
        logo: d1Text(liveMarket?.logo || firstString(info, ["logo", "logo_url"]) || firstString(tradeToken, ["logo", "logo_url"])),
        threshold: d1Integer(due), holder_count: d1Integer(holderCount), market_cap: d1Integer(marketCap), liquidity: d1Integer(liquidity),
        holders: d1Integer(holders), volume_24h: d1Integer(volume24h), price: d1Text(currentPrice, "0"), gmgn_theme: d1Text(gmgnTheme.slice(0, 500)),
        official_description: d1Text(officialDescription).slice(0, 1200), description_source: d1Text(liveMarket?.descriptionSource), description_updated_at: d1Text(liveMarket?.descriptionUpdatedAt),
        ai_analysis: d1Text(narrative.aiAnalysis), wallet_names_json: d1Json(walletNames, []), alerted_at: new Date().toISOString(), alert_payload_json: d1Json(alertPayload),
      }).run();
      const signalId = Number(inserted.meta.last_row_id);
      if (due === 6 || due === 38) {
        for (const post of narrative.posts) {
          await write(db, "INSERT INTO hot_posts (signal_id, rank, author, posted_at, url, original, chinese, engagement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "hot_posts.insert", {
            signal_id: d1Integer(signalId), rank: d1Integer(post.rank), author: d1Text(post.author), posted_at: d1Text(post.postedAt),
            url: d1Text(post.url), original: d1Text(post.original), chinese: d1Text(post.chinese), engagement: d1Text(post.engagement),
          }).run();
        }
      }
      const publicUrl = String((env as unknown as Record<string, unknown>).PUBLIC_SITE_URL || "").replace(/\/$/, "");
      alertPayload.detailUrl = publicUrl ? `${publicUrl}/signal/${signalId}` : "";
      await write(db, "UPDATE signals SET alert_payload_json = ? WHERE id = ?", "signals.alert_payload", {
        alert_payload_json: d1Json(alertPayload), id: d1Integer(signalId),
      }).run();
      newSignals += 1;
    }
    const alertDeliveryAfter = await deliverAlerts(db);
    const finishedAt = new Date().toISOString();
    await write(db, "INSERT INTO monitor_runs (status, new_trades, new_signals, started_at, finished_at, chain, fetched_rows, matched_rows, feed_errors_json, data_review_count, market_conflict_count) VALUES ('success', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", "monitor_runs.success", {
      new_trades: d1Integer(newTrades), new_signals: d1Integer(newSignals), started_at: d1Text(startedAt), finished_at: d1Text(finishedAt),
      chain: d1Text(selectedChain), fetched_rows: d1Integer(fetchedRows), matched_rows: d1Integer(matchedRows), feed_errors_json: d1Json(feedErrors, []),
      data_review_count: d1Integer(dataReviewCount), market_conflict_count: d1Integer(marketConflictCount),
    }).run();
    return { ok: true, selectedChain, fetchedRows, matchedRows, newTrades, newSignals, dataReviewCount, marketConflictCount, feedErrors, alertDeliveryBefore, alertDeliveryAfter, startedAt, finishedAt };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "未知错误";
    try {
      await write(db, "INSERT INTO monitor_runs (status, new_trades, new_signals, error, started_at, finished_at, chain, fetched_rows, matched_rows, feed_errors_json, data_review_count, market_conflict_count) VALUES ('failed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", "monitor_runs.failed", {
        new_trades: d1Integer(newTrades), new_signals: d1Integer(newSignals), error: d1Text(message), started_at: d1Text(startedAt), finished_at: d1Text(finishedAt),
        chain: d1Text(selectedChain), fetched_rows: d1Integer(fetchedRows), matched_rows: d1Integer(matchedRows), feed_errors_json: d1Json(feedErrors, []),
        data_review_count: d1Integer(dataReviewCount), market_conflict_count: d1Integer(marketConflictCount),
      }).run();
    } catch (recordError) {
      throw new AggregateError([error, recordError], `监控失败且无法写入 monitor_runs：${message}`);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isMonitorPaused((env as unknown as Record<string, unknown>).MONITOR_PAUSED)) {
    return Response.json({ error: "Monitor temporarily paused" }, { status: 503, headers: { "Retry-After": "60" } });
  }
  try {
    const requested = new URL(request.url).searchParams.get("chain");
    const selectedChain = CHAINS.includes(requested as typeof CHAINS[number])
      ? requested as typeof CHAINS[number]
      : CHAINS[Math.floor(Date.now() / 60000) % CHAINS.length];
    let supplied: SuppliedFeeds | undefined;
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json().catch(() => null) as { feeds?: SuppliedFeeds } | null;
      supplied = body?.feeds;
    }
    return Response.json(await runMonitor(selectedChain, supplied));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "监控运行失败" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  void request;
  return Response.json({ error: "Method Not Allowed" }, { status: 405, headers: { Allow: "POST" } });
}
