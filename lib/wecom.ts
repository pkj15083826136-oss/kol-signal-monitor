import { env } from "cloudflare:workers";

function compact(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export async function sendWeComAlert(signal: Record<string, unknown>) {
  const webhook = (env as unknown as Record<string, unknown>).WECOM_WEBHOOK_URL;
  if (typeof webhook !== "string" || !webhook) throw new Error("WECOM_WEBHOOK_URL 未配置");
  const names = Array.isArray(signal.walletNames) ? signal.walletNames.slice(0, 12).join("、") : "—";
  const content = [
    `## 🔥 KOL聚集预警｜${compact(signal.holderCount)}人`,
    `> **${compact(signal.name)} (${compact(signal.symbol)})** · ${compact(signal.chain)}`,
    `> 合约：<font color=\"comment\">${compact(signal.address)}</font>`,
    `> 市值：**${compact(signal.marketCap)}**　流动性：**${compact(signal.liquidity)}**`,
    `> 持币地址：${compact(signal.holders)}　24H交易额：${compact(signal.volume24h)}`,
    `> GMGN主题：${compact(signal.gmgnTheme)}`,
    `> **AI分析：${compact(signal.aiAnalysis)}**`,
    `> 建仓账户：${names}`,
    signal.detailUrl ? `[查看完整信号与热门评论](${signal.detailUrl})` : "",
  ].filter(Boolean).join("\n");
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
  });
  const payload = (await response.json()) as { errcode?: number; errmsg?: string };
  if (!response.ok || payload.errcode !== 0) throw new Error(payload.errmsg || `企业微信 HTTP ${response.status}`);
}

