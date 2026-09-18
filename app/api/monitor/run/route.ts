import { env } from "cloudflare:workers";
import { getKolTrades, getSmartMoneyTrades, getTokenInfo, asList, asRecord, firstNumber, firstString } from "@/lib/gmgn";
import { analyzeNarrative, type NarrativeResult } from "@/lib/xai";
import { sendWeComAlert } from "@/lib/wecom";
import { watchedByAddress } from "@/lib/wallets";
import { getMarketData } from "@/lib/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAINS = ["sol", "bsc", "base", "robinhood"] as const;
const THRESHOLDS = [6, 18, 38, 58] as const;
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
  const expected = secret();
  const gmgnKey = String((env as unknown as Record<string, unknown>).GMGN_API_KEY || "");
  const authorization = request.headers.get("authorization");
  return Boolean((expected && authorization === `Bearer ${expected}`) || (gmgnKey && authorization === `Bearer ${gmgnKey}`));
}

function nested(record: Record<string, unknown>, key: string) {
  return asRecord(record[key]);
}

function parseTrade(chain: string, row: Record<string, unknown>, source: "kol" | "smartmoney"): Trade | null {
  const makerInfo = nested(row, "maker_info");
  const tokenInfo = asRecord(row.token ?? row.token_info ?? row.base_token);
  const wallet = firstString(row, ["maker", "wallet_address", "address", "owner"]) || firstString(makerInfo, ["address", "wallet_address"]);
  const watched = watchedByAddress.get(`${CHAIN_LABEL[chain].toLowerCase()}:${wallet.toLowerCase()}`);
  // The fixed GMGN + Ave list remains the core pool. GMGN's KOL feed is also
  // accepted dynamically so the monitor follows the live KOL badges shown on
  // each token page instead of silently dropping newly-labelled KOL wallets.
  if (!watched && source !== "kol") return null;
  const token = firstString(row, ["token_address", "base_address", "base_token_address", "contract_address", "mint", "address"]) || firstString(tokenInfo, ["address", "token_address", "contract_address", "mint"]);
  if (!token || token.toLowerCase() === wallet.toLowerCase()) return null;
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
    wallet,
    walletName: watched?.name || firstString(makerInfo, ["twitter_name", "twitter_username"]) || "GMGN动态KOL",
    token,
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
  const signal = await db.prepare("SELECT id, ai_analysis FROM signals WHERE chain = ? AND token_address = ? ORDER BY alerted_at DESC LIMIT 1").bind(chain, token).first<{ id: number; ai_analysis: string }>();
  if (!signal) return null;
  const rows = await db.prepare("SELECT rank, author, posted_at, url, original, chinese, engagement FROM hot_posts WHERE signal_id = ? ORDER BY rank").bind(signal.id).all<Record<string, unknown>>();
  return {
    aiAnalysis: signal.ai_analysis,
    raw: "",
    posts: rows.results.map((row) => ({
      rank: Number(row.rank), author: String(row.author), postedAt: String(row.posted_at ?? ""), url: String(row.url),
      original: String(row.original), chinese: String(row.chinese), engagement: String(row.engagement ?? ""),
    })),
  };
}

type SuppliedFeeds = { kol?: unknown; smartmoney?: unknown };

async function runMonitor(selectedChain: typeof CHAINS[number], supplied?: SuppliedFeeds) {
  const db = env.DB;
  const startedAt = new Date().toISOString();
  let newTrades = 0;
  let newSignals = 0;
  let fetchedRows = 0;
  let matchedRows = 0;
  let feedErrors: string[] = [];
  const touched = new Map<string, { chain: string; token: string }>();
  try {
    const feeds: Array<{ chain: string; kind: "kol" | "smartmoney"; data: unknown; error: string }> = [];
    if (supplied) {
      feeds.push({ chain: selectedChain, kind: "kol", data: supplied.kol ?? { list: [] }, error: "" });
      feeds.push({ chain: selectedChain, kind: "smartmoney", data: supplied.smartmoney ?? { list: [] }, error: "" });
    } else {
      for (const chain of [selectedChain]) {
        for (const [kind, getter] of [["kol", getKolTrades], ["smartmoney", getSmartMoneyTrades]] as const) {
          try {
            feeds.push({ chain, kind, data: await getter(chain), error: "" });
          } catch (error) {
            feeds.push({ chain, kind, data: { list: [] }, error: `${kind}:${chain}:${error instanceof Error ? error.message : String(error)}` });
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
      const inserted = await db.prepare(`INSERT OR IGNORE INTO trades
        (id, chain, wallet_address, wallet_name, token_address, side, amount_usd, token_amount, traded_at, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(trade.id, trade.chain, trade.wallet, trade.walletName, trade.token, trade.side, Math.round(trade.usd), String(trade.amount), trade.at, JSON.stringify(trade.raw)).run();
      if (!inserted.meta.changes) continue;
      newTrades += 1;
      const existing = await db.prepare("SELECT balance, buy_usd, first_buy_at FROM token_wallets WHERE chain = ? AND token_address = ? AND wallet_address = ?")
        .bind(trade.chain, trade.token, trade.wallet).first<{ balance: number; buy_usd: number; first_buy_at: string }>();
      const signedAmount = trade.side === "buy" ? trade.amount : -trade.amount;
      const balance = Math.max(0, Number(existing?.balance || 0) + signedAmount);
      if (existing) {
        await db.prepare("UPDATE token_wallets SET wallet_name = ?, last_buy_at = ?, buy_usd = ?, balance = ? WHERE chain = ? AND token_address = ? AND wallet_address = ?")
          .bind(trade.walletName, trade.at, Number(existing.buy_usd || 0) + (trade.side === "buy" ? Math.round(trade.usd) : 0), balance, trade.chain, trade.token, trade.wallet).run();
      } else if (trade.side === "buy") {
        await db.prepare("INSERT INTO token_wallets (chain, token_address, wallet_address, wallet_name, first_buy_at, last_buy_at, buy_usd, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(trade.chain, trade.token, trade.wallet, trade.walletName, trade.at, trade.at, Math.round(trade.usd), balance).run();
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
      .bind(selectedChain, THRESHOLDS[0]).all<{ chain: string; token_address: string }>();
    for (const row of qualifying.results) {
      touched.set(`${row.chain}:${row.token_address}`, { chain: row.chain, token: row.token_address });
    }

    for (const { chain, token } of touched.values()) {
      const aggregate = await db.prepare("SELECT COUNT(*) holder_count, COALESCE(SUM(buy_usd),0) total_buy_usd, COALESCE(SUM(balance),0) total_token_amount FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0.000001")
        .bind(chain, token).first<{ holder_count: number; total_buy_usd: number; total_token_amount: number }>();
      const holderCount = Number(aggregate?.holder_count || 0);
      const due = [...THRESHOLDS].reverse().find((threshold) => holderCount >= threshold);
      const previousSignal = await db.prepare("SELECT id, price FROM signals WHERE chain = ? AND token_address = ? ORDER BY alerted_at DESC LIMIT 1").bind(chain, token).first<{ id: number; price: string }>();
      if (!previousSignal && holderCount < THRESHOLDS[0]) continue;
      const liveMarket = await getMarketData(chain, token).catch(() => null);
      const price = liveMarket?.price || Number(previousSignal?.price || 0);
      await db.prepare("INSERT INTO snapshots (chain, token_address, holder_count, total_buy_usd, total_token_amount, market_value, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(chain, token, holderCount, Math.round(Number(aggregate?.total_buy_usd || 0)), Number(aggregate?.total_token_amount || 0), Number(aggregate?.total_token_amount || 0) * price, new Date().toISOString()).run();
      if (previousSignal && liveMarket) {
        await db.prepare(`UPDATE signals SET
          name = CASE WHEN ? != '' THEN ? ELSE name END,
          symbol = CASE WHEN ? != '' THEN ? ELSE symbol END,
          logo = CASE WHEN ? != '' THEN ? ELSE logo END,
          market_cap = CASE WHEN ? > 0 THEN ? ELSE market_cap END,
          liquidity = CASE WHEN ? > 0 THEN ? ELSE liquidity END,
          holders = CASE WHEN ? > 0 THEN ? ELSE holders END,
          volume_24h = CASE WHEN ? > 0 THEN ? ELSE volume_24h END,
          price = CASE WHEN ? > 0 THEN ? ELSE price END,
          gmgn_theme = CASE WHEN ? != '' THEN ? ELSE gmgn_theme END
          WHERE chain = ? AND token_address = ?`)
          .bind(liveMarket.name, liveMarket.name, liveMarket.symbol, liveMarket.symbol, liveMarket.logo, liveMarket.logo,
            liveMarket.marketCap, Math.round(liveMarket.marketCap), liveMarket.liquidity, Math.round(liveMarket.liquidity),
            liveMarket.holders, Math.round(liveMarket.holders), liveMarket.volume24h, Math.round(liveMarket.volume24h),
            liveMarket.price, String(liveMarket.price), liveMarket.description, liveMarket.description, chain, token).run();
      }
      if (!due) continue;
      const exists = await db.prepare("SELECT 1 FROM signals WHERE chain = ? AND token_address = ? AND threshold = ?").bind(chain, token, due).first();
      if (exists) continue;
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
      const totalSupply = firstNumber(tradeToken, ["total_supply", "supply"]);
      const marketCap = liveMarket?.marketCap || firstNumber(info, ["market_cap", "marketcap", "fdv"]) || currentPrice * totalSupply;
      const liquidity = liveMarket?.liquidity || firstNumber(info, ["liquidity", "liquidity_usd"]);
      const holders = liveMarket?.holders || firstNumber(info, ["holder_count", "holders"]);
      const volume24h = liveMarket?.volume24h || firstNumber(info, ["volume_24h", "volume24h", "swap_volume_24h"]);
      const launchpad = firstString(tradeToken, ["launchpad"]);
      const gmgnTheme = liveMarket?.description || firstString(info, ["description", "narrative", "theme", "bio"]) || (launchpad ? `由 ${launchpad} 发行，等待社媒叙事确认` : "暂无明确项目介绍");
      let narrative = (due === 6 || due === 38) ? await analyzeNarrative({ chain, address: token, symbol, name }).catch(() => null) : await latestNarrative(db, chain, token);
      if (!narrative) narrative = { aiAnalysis: "社媒有效信息不足，暂未形成清晰叙事。", posts: [], raw: "" };
      const walletRows = await db.prepare("SELECT wallet_name FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0.000001 ORDER BY first_buy_at LIMIT 80").bind(chain, token).all<{ wallet_name: string }>();
      const walletNames = walletRows.results.map((row) => row.wallet_name);
      const inserted = await db.prepare(`INSERT INTO signals
        (chain, token_address, name, symbol, logo, threshold, holder_count, market_cap, liquidity, holders, volume_24h, price, gmgn_theme, ai_analysis, wallet_names_json, alerted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(chain, token, name, symbol, liveMarket?.logo || firstString(info, ["logo", "logo_url"]) || firstString(tradeToken, ["logo", "logo_url"]), due, holderCount, Math.round(marketCap), Math.round(liquidity), Math.round(holders), Math.round(volume24h), String(currentPrice), gmgnTheme.slice(0, 500), narrative.aiAnalysis, JSON.stringify(walletNames), new Date().toISOString()).run();
      const signalId = Number(inserted.meta.last_row_id);
      if (due === 6 || due === 38) {
        for (const post of narrative.posts) {
          await db.prepare("INSERT INTO hot_posts (signal_id, rank, author, posted_at, url, original, chinese, engagement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(signalId, post.rank, post.author, post.postedAt, post.url, post.original, post.chinese, post.engagement || "").run();
        }
      }
      const publicUrl = String((env as unknown as Record<string, unknown>).PUBLIC_SITE_URL || "").replace(/\/$/, "");
      await sendWeComAlert({
        name, symbol, chain: CHAIN_LABEL[chain], address: token, holderCount,
        marketCap: formatMoney(marketCap), liquidity: formatMoney(liquidity), holders, volume24h: formatMoney(volume24h),
        gmgnTheme, aiAnalysis: narrative.aiAnalysis, walletNames, detailUrl: publicUrl ? `${publicUrl}/signal/${signalId}` : "",
      }).catch(() => undefined);
      newSignals += 1;
    }
    const finishedAt = new Date().toISOString();
    await db.prepare("INSERT INTO monitor_runs (status, new_trades, new_signals, started_at, finished_at) VALUES ('success', ?, ?, ?, ?)").bind(newTrades, newSignals, startedAt, finishedAt).run();
    return { ok: true, selectedChain, fetchedRows, matchedRows, newTrades, newSignals, feedErrors, startedAt, finishedAt };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "未知错误";
    await db.prepare("INSERT INTO monitor_runs (status, new_trades, new_signals, error, started_at, finished_at) VALUES ('failed', ?, ?, ?, ?, ?)").bind(newTrades, newSignals, message, startedAt, finishedAt).run().catch(() => undefined);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
  return POST(request);
}
