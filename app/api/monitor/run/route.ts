import { env } from "cloudflare:workers";
import { getKolTrades, getSmartMoneyTrades, getTokenInfo, asList, asRecord, firstNumber, firstString } from "@/lib/gmgn";
import { analyzeNarrative, type NarrativeResult } from "@/lib/xai";
import { sendWeComAlert } from "@/lib/wecom";
import { watchedByAddress } from "@/lib/wallets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAINS = ["sol", "bsc", "base", "robinhood"] as const;
const THRESHOLDS = [6, 18, 38, 58] as const;
const CHAIN_LABEL: Record<string, string> = { sol: "Solana", bsc: "BSC", base: "Base", robinhood: "Robinhood" };

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
  return expected && request.headers.get("authorization") === `Bearer ${expected}`;
}

function nested(record: Record<string, unknown>, key: string) {
  return asRecord(record[key]);
}

function parseTrade(chain: string, row: Record<string, unknown>): Trade | null {
  const makerInfo = nested(row, "maker_info");
  const tokenInfo = asRecord(row.token ?? row.token_info ?? row.base_token);
  const wallet = firstString(row, ["maker", "wallet_address", "address", "owner"]) || firstString(makerInfo, ["address", "wallet_address"]);
  const watched = watchedByAddress.get(`${CHAIN_LABEL[chain].toLowerCase()}:${wallet.toLowerCase()}`);
  if (!watched) return null;
  const token = firstString(row, ["token_address", "base_address", "base_token_address", "contract_address", "mint", "address"]) || firstString(tokenInfo, ["address", "token_address", "contract_address", "mint"]);
  if (!token || token.toLowerCase() === wallet.toLowerCase()) return null;
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
    walletName: watched.name || firstString(makerInfo, ["twitter_name", "twitter_username"]) || "聪明钱包",
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

async function runMonitor() {
  const db = env.DB;
  const startedAt = new Date().toISOString();
  let newTrades = 0;
  let newSignals = 0;
  const touched = new Map<string, { chain: string; token: string }>();
  try {
    const feeds = await Promise.all(CHAINS.flatMap((chain) => [
      getKolTrades(chain).then((data) => ({ chain, data })).catch(() => ({ chain, data: { list: [] } })),
      getSmartMoneyTrades(chain).then((data) => ({ chain, data })).catch(() => ({ chain, data: { list: [] } })),
    ]));
    const parsed = feeds.flatMap(({ chain, data }) => asList(data).map((row) => parseTrade(chain, row)).filter((row): row is Trade => Boolean(row)));

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

    for (const { chain, token } of touched.values()) {
      const aggregate = await db.prepare("SELECT COUNT(*) holder_count, COALESCE(SUM(buy_usd),0) total_buy_usd, COALESCE(SUM(balance),0) total_token_amount FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0")
        .bind(chain, token).first<{ holder_count: number; total_buy_usd: number; total_token_amount: number }>();
      const holderCount = Number(aggregate?.holder_count || 0);
      const due = [...THRESHOLDS].reverse().find((threshold) => holderCount >= threshold);
      const infoValue = await getTokenInfo(chain, token).catch(() => ({}));
      const info = unwrapTokenInfo(infoValue);
      const price = firstNumber(info, ["price", "price_usd"]);
      await db.prepare("INSERT INTO snapshots (chain, token_address, holder_count, total_buy_usd, total_token_amount, market_value, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(chain, token, holderCount, Math.round(Number(aggregate?.total_buy_usd || 0)), Number(aggregate?.total_token_amount || 0), Number(aggregate?.total_token_amount || 0) * price, new Date().toISOString()).run();
      if (!due) continue;
      const exists = await db.prepare("SELECT 1 FROM signals WHERE chain = ? AND token_address = ? AND threshold = ?").bind(chain, token, due).first();
      if (exists) continue;

      const name = firstString(info, ["name", "token_name"]) || "Unknown";
      const symbol = firstString(info, ["symbol", "token_symbol"]) || "—";
      const marketCap = firstNumber(info, ["market_cap", "marketcap", "fdv"]);
      const liquidity = firstNumber(info, ["liquidity", "liquidity_usd"]);
      const holders = firstNumber(info, ["holder_count", "holders"]);
      const volume24h = firstNumber(info, ["volume_24h", "volume24h", "swap_volume_24h"]);
      const gmgnTheme = firstString(info, ["description", "narrative", "theme", "bio"]) || "暂无明确项目介绍";
      let narrative = (due === 6 || due === 38) ? await analyzeNarrative({ chain, address: token, symbol, name }).catch(() => null) : await latestNarrative(db, chain, token);
      if (!narrative) narrative = { aiAnalysis: "社媒有效信息不足，暂未形成清晰叙事。", posts: [], raw: "" };
      const walletRows = await db.prepare("SELECT wallet_name FROM token_wallets WHERE chain = ? AND token_address = ? AND balance > 0 ORDER BY first_buy_at LIMIT 80").bind(chain, token).all<{ wallet_name: string }>();
      const walletNames = walletRows.results.map((row) => row.wallet_name);
      const inserted = await db.prepare(`INSERT INTO signals
        (chain, token_address, name, symbol, logo, threshold, holder_count, market_cap, liquidity, holders, volume_24h, price, gmgn_theme, ai_analysis, wallet_names_json, alerted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(chain, token, name, symbol, firstString(info, ["logo", "logo_url"]), due, holderCount, Math.round(marketCap), Math.round(liquidity), Math.round(holders), Math.round(volume24h), String(price), gmgnTheme.slice(0, 500), narrative.aiAnalysis, JSON.stringify(walletNames), new Date().toISOString()).run();
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
    return { ok: true, newTrades, newSignals, startedAt, finishedAt };
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
    return Response.json(await runMonitor());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "监控运行失败" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
