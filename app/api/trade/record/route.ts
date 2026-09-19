import { env } from "cloudflare:workers";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import { d1Bindings, d1Text } from "@/lib/d1-values";
import { normalizeTradeRecord, validateTradeRecordInput, type UserTradeRecord } from "@/lib/trade/records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  const errors = validateTradeRecordInput(raw);
  if (errors.length) return Response.json({ error: errors.join("；") }, { status: 400 });
  const record = normalizeTradeRecord(raw as UserTradeRecord);
  const enabled = record.network === "testnet" ? flags.tradeTestnet : flags.tradeMainnet && flags.tradeMainnetChains[record.chain];
  if (!enabled) return Response.json({ error: "该网络交易记录功能未开放" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "DB binding 未配置" }, { status: 500 });
  await env.DB.prepare(`INSERT INTO user_trades
    (chain, network, tx_hash, wallet_address, sell_token, buy_token, sell_amount, minimum_out, status, approval_tx_hash, error_code, created_at, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chain, tx_hash) DO UPDATE SET status=excluded.status, error_code=excluded.error_code, confirmed_at=excluded.confirmed_at`)
    .bind(...d1Bindings("user_trades.upsert", {
      chain: d1Text(record.chain), network: d1Text(record.network), tx_hash: d1Text(record.txHash), wallet_address: d1Text(record.walletAddress),
      sell_token: d1Text(record.sellToken), buy_token: d1Text(record.buyToken), sell_amount: d1Text(record.sellAmount), minimum_out: d1Text(record.minimumOut),
      status: d1Text(record.status), approval_tx_hash: record.approvalTxHash ?? null, error_code: record.errorCode ?? null, created_at: d1Text(record.createdAt), confirmed_at: record.confirmedAt ?? null,
    })).run();
  return Response.json({ ok: true, chain: record.chain, txHash: record.txHash, status: record.status }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
