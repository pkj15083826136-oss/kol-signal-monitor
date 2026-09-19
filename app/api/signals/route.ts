import { env } from "cloudflare:workers";
import { getMarketData } from "@/lib/market";
import { verifiedTokenIdentity } from "@/lib/token-identity";
import { isMatureBaseAsset } from "@/lib/signal-policy";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const backfillAttempts = new Map<string, number>();

function mapSignal(row: Row) {
  const identity = verifiedTokenIdentity(String(row.chain), String(row.token_address), String(row.name), String(row.symbol));
  return {
    id: Number(row.id), chain: String(row.chain), tokenAddress: String(row.token_address), name: identity.name, symbol: identity.symbol,
    logo: String(row.logo || ""), threshold: Number(row.threshold), holderCount: Number(row.holder_count), marketCap: Number(row.market_cap),
    liquidity: Number(row.liquidity), holders: Number(row.holders), volume24h: Number(row.volume_24h), gmgnTheme: String(row.gmgn_theme),
    aiAnalysis: String(row.ai_analysis), walletNames: JSON.parse(String(row.wallet_names_json || "[]")), alertedAt: String(row.alerted_at),
  };
}

export async function GET() {
  const rows = await env.DB.prepare(`SELECT id, chain, token_address, name, symbol, logo, threshold, holder_count, market_cap,
    liquidity, holders, volume_24h, gmgn_theme, ai_analysis, wallet_names_json, alerted_at
    FROM signals ORDER BY alerted_at DESC LIMIT 80`).all<Row>();
  const now = Date.now();
  const stale = rows.results.filter((row) => {
    if (Number(row.liquidity) && Number(row.holders) && Number(row.volume_24h)) return false;
    const key = `${row.chain}:${row.token_address}`;
    return now - (backfillAttempts.get(key) || 0) > 6 * 60 * 60 * 1000;
  }).slice(0, 4);
  await Promise.all(stale.map(async (row) => {
    backfillAttempts.set(`${row.chain}:${row.token_address}`, now);
    const market = await getMarketData(String(row.chain), String(row.token_address)).catch(() => null);
    if (!market) return;
    const next = {
      name: market.name || String(row.name), symbol: market.symbol || String(row.symbol), logo: market.logo || String(row.logo || ""),
      marketCap: market.marketCap || Number(row.market_cap), liquidity: market.liquidity || Number(row.liquidity),
      holders: market.holders || Number(row.holders), volume24h: market.volume24h || Number(row.volume_24h),
    };
    Object.assign(row, { name: next.name, symbol: next.symbol, logo: next.logo, market_cap: next.marketCap, liquidity: next.liquidity, holders: next.holders, volume_24h: next.volume24h });
    await env.DB.prepare("UPDATE signals SET name=?, symbol=?, logo=?, market_cap=?, liquidity=?, holders=?, volume_24h=? WHERE id=?")
      .bind(next.name, next.symbol, next.logo, Math.round(next.marketCap), Math.round(next.liquidity), Math.round(next.holders), Math.round(next.volume24h), Number(row.id)).run();
  }));
  const run = await env.DB.prepare("SELECT status, finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ status: string; finished_at: string }>();
  return Response.json({ signals: rows.results.map(mapSignal).filter((signal) => !isMatureBaseAsset(signal.symbol)), lastRun: run?.finished_at ?? null, monitorOk: run?.status === "success" }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
