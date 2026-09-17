import { env } from "cloudflare:workers";
import { analyzeNarrative } from "@/lib/xai";
import { sendWeComAlert } from "@/lib/wecom";
import wallets from "@/data/wallets.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = String((env as unknown as Record<string, unknown>).MONITOR_SECRET || "");
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = env.DB;
  const chain = "sol";
  const token = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp";
  const name = "BONK 链路测试";
  const symbol = "BONK-TEST";
  const selected = (wallets as Array<{ address: string; name?: string; chains?: string[] }>).filter((w) => w.chains?.some((c) => c.toLowerCase() === "solana")).slice(0, 6);
  const narrative = await analyzeNarrative({ chain, address: token, symbol: "BONK", name: "Bonk" });
  const now = new Date().toISOString();
  const prior = await db.prepare("SELECT id FROM signals WHERE chain = ? AND token_address = ? AND name = ? ORDER BY id DESC LIMIT 1").bind(chain, token, name).first<{ id: number }>();
  if (prior) {
    await db.prepare("DELETE FROM hot_posts WHERE signal_id = ?").bind(prior.id).run();
    await db.prepare("DELETE FROM signals WHERE id = ?").bind(prior.id).run();
  }
  const inserted = await db.prepare(`INSERT INTO signals
    (chain, token_address, name, symbol, logo, threshold, holder_count, market_cap, liquidity, holders, volume_24h, price, gmgn_theme, ai_analysis, wallet_names_json, alerted_at)
    VALUES (?, ?, ?, ?, '', 6, 6, 0, 0, 0, 0, '0', ?, ?, ?, ?)`)
    .bind(chain, token, name, symbol, "链路测试：验证X搜索、AI分析、热门评论、数据库、网页及企业微信通知。", narrative.aiAnalysis, JSON.stringify(selected.map((w) => w.name || w.address)), now).run();
  const signalId = Number(inserted.meta.last_row_id);
  for (const post of narrative.posts) {
    await db.prepare("INSERT INTO hot_posts (signal_id, rank, author, posted_at, url, original, chinese, engagement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(signalId, post.rank, post.author, post.postedAt, post.url, post.original, post.chinese, post.engagement || "").run();
  }
  await db.prepare("INSERT INTO snapshots (chain, token_address, holder_count, total_buy_usd, total_token_amount, market_value, captured_at) VALUES (?, ?, 6, 0, 0, 0, ?)").bind(chain, token, now).run();
  const publicUrl = String((env as unknown as Record<string, unknown>).PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const walletNames = selected.map((w) => w.name || w.address);
  let wecom = "sent";
  await sendWeComAlert({
    name, symbol, chain: "Solana", address: token, holderCount: 6, marketCap: "$0（测试）", liquidity: "$0（测试）", holders: 0,
    volume24h: "$0（测试）", gmgnTheme: "链路测试，不是交易信号。", aiAnalysis: narrative.aiAnalysis, walletNames,
    detailUrl: `${publicUrl}/signal/${signalId}`,
  }).catch((error) => { wecom = error instanceof Error ? error.message : String(error); });
  return Response.json({ ok: true, signalId, posts: narrative.posts.length, aiAnalysis: narrative.aiAnalysis, wecom, detailUrl: `${publicUrl}/signal/${signalId}` });
}
