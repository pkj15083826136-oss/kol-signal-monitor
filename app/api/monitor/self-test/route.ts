import { env } from "cloudflare:workers";
import { analyzeNarrative } from "@/lib/xai";
import { sendWeComAlert } from "@/lib/wecom";
import wallets from "@/data/wallets.json";
import { d1Bindings, d1Integer, d1Json, d1Text } from "@/lib/d1-values";
import { AlertDeliveryError } from "@/lib/alert-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = String((env as unknown as Record<string, unknown>).MONITOR_SECRET || "");
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = env.DB;
  if (!db) return Response.json({ error: "DB binding 未配置" }, { status: 500 });
  const chain = "sol";
  const token = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp";
  const name = "BONK 链路测试";
  const symbol = "BONK-TEST";
  const selected = (wallets as Array<{ address: string; name?: string; chains?: string[] }>).filter((w) => w.chains?.some((c) => c.toLowerCase() === "solana")).slice(0, 6);
  const narrative = await analyzeNarrative({ chain, address: token, symbol: "BONK", name: "Bonk" });
  const now = new Date().toISOString();
  const prior = await db.prepare("SELECT id FROM signals WHERE chain = ? AND token_address = ? AND name = ? ORDER BY id DESC LIMIT 1").bind(chain, token, name).first<{ id: number }>();
  if (prior) {
    await db.prepare("DELETE FROM hot_posts WHERE signal_id = ?").bind(d1Integer(prior.id)).run();
    await db.prepare("DELETE FROM signals WHERE id = ?").bind(d1Integer(prior.id)).run();
  }
  const inserted = await db.prepare(`INSERT INTO signals
    (chain, token_address, name, symbol, logo, threshold, holder_count, market_cap, liquidity, holders, volume_24h, price, gmgn_theme, ai_analysis, wallet_names_json, alerted_at, alert_status, alert_attempts, alert_payload_json)
    VALUES (?, ?, ?, ?, '', 6, 6, 0, 0, 0, 0, '0', ?, ?, ?, ?, 'pending', 0, '')`)
    .bind(...d1Bindings("signals.self_test", {
      chain: d1Text(chain), token_address: d1Text(token), name: d1Text(name), symbol: d1Text(symbol),
      gmgn_theme: "链路测试：验证X搜索、AI分析、热门评论、数据库、网页及企业微信通知。",
      ai_analysis: d1Text(narrative.aiAnalysis), wallet_names_json: d1Json(selected.map((w) => w.name || w.address), []), alerted_at: d1Text(now),
    })).run();
  const signalId = Number(inserted.meta.last_row_id);
  for (const post of narrative.posts) {
    await db.prepare("INSERT INTO hot_posts (signal_id, rank, author, posted_at, url, original, chinese, engagement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(...d1Bindings("hot_posts.self_test", {
        signal_id: d1Integer(signalId), rank: d1Integer(post.rank), author: d1Text(post.author), posted_at: d1Text(post.postedAt),
        url: d1Text(post.url), original: d1Text(post.original), chinese: d1Text(post.chinese), engagement: d1Text(post.engagement),
      })).run();
  }
  await db.prepare("INSERT INTO snapshots (chain, token_address, holder_count, total_buy_usd, total_token_amount, market_value, captured_at) VALUES (?, ?, 6, 0, 0, 0, ?)")
    .bind(...d1Bindings("snapshots.self_test", { chain: d1Text(chain), token_address: d1Text(token), captured_at: d1Text(now) })).run();
  const publicUrl = String((env as unknown as Record<string, unknown>).PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const walletNames = selected.map((w) => w.name || w.address);
  const alertPayload = {
    name, symbol, chain: "Solana", address: token, holderCount: 6, marketCap: "$0（测试）", liquidity: "$0（测试）", holders: 0,
    volume24h: "$0（测试）", gmgnTheme: "链路测试，不是交易信号。", aiAnalysis: narrative.aiAnalysis, walletNames,
    detailUrl: `${publicUrl}/signal/${signalId}`,
  };
  await db.prepare("UPDATE signals SET alert_payload_json = ?, alert_status = 'sending', alert_attempts = 1, alert_last_attempt_at = ? WHERE id = ?")
    .bind(...d1Bindings("signals.self_test_alert_start", { alert_payload_json: d1Json(alertPayload), alert_last_attempt_at: d1Text(now), id: d1Integer(signalId) })).run();
  try {
    await sendWeComAlert(alertPayload);
    await db.prepare("UPDATE signals SET alert_status = 'sent', alert_sent_at = ?, alert_error = NULL WHERE id = ?")
      .bind(...d1Bindings("signals.self_test_alert_sent", { alert_sent_at: new Date().toISOString(), id: d1Integer(signalId) })).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof AlertDeliveryError && error.retryable;
    const nextAttempt = retryable ? new Date(Date.now() + 2 * 60_000).toISOString() : null;
    await db.prepare("UPDATE signals SET alert_status = ?, alert_error = ?, alert_next_attempt_at = ? WHERE id = ?")
      .bind(...d1Bindings("signals.self_test_alert_failed", {
        alert_status: retryable ? "retry" : "manual_review", alert_error: d1Text(message).slice(0, 1000), alert_next_attempt_at: nextAttempt, id: d1Integer(signalId),
      })).run();
    return Response.json({ ok: false, signalId, error: "企业微信链路测试未确认送达", alertStatus: retryable ? "retry" : "manual_review" }, { status: 502 });
  }
  return Response.json({ ok: true, signalId, posts: narrative.posts.length, aiAnalysis: narrative.aiAnalysis, wecom: "sent", detailUrl: `${publicUrl}/signal/${signalId}` });
}
