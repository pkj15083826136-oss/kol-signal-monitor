import { env } from "cloudflare:workers";
import Dashboard, { type SignalRow } from "./dashboard";
import { watchedWallets } from "@/lib/wallets";
import { isRejectedTokenIdentity, verifiedTokenIdentity } from "@/lib/token-identity";
import { isMatureBaseAsset } from "@/lib/signal-policy";
import { buildAlertSummary, buildChainHealth, buildSourceHealth, type AlertSummary, type ChainHealth, type SourceHealth } from "@/lib/ops-status";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import { DEFAULT_KOL_ALERT_MAX_MARKET_CAP, parseMarketCapLimit } from "@/lib/market-cap-policy";
import { encodeSignalCursor } from "@/lib/signal-pagination";

export const dynamic = "force-dynamic";

async function loadSignals(): Promise<{ signals: SignalRow[]; nextCursor: string | null; lastRun: string | null; monitorOk: boolean; chainHealth: ChainHealth[]; sourceHealth: SourceHealth[]; alertSummary: AlertSummary }> {
  try {
    const db = env.DB;
    if (!db) throw new Error("DB binding 未配置");
    const configured = await db.prepare("SELECT value FROM system_settings WHERE key='KOL_ALERT_MAX_MARKET_CAP'").first<{ value: string }>().catch(() => null);
    const cap = parseMarketCapLimit(configured?.value ?? (env as unknown as Record<string, unknown>).KOL_ALERT_MAX_MARKET_CAP, DEFAULT_KOL_ALERT_MAX_MARKET_CAP);
    const rows = await db.prepare(`SELECT id, chain, token_address, name, symbol, logo, threshold, holder_count, price, market_cap,
      liquidity, holders, volume_24h, gmgn_theme, ai_analysis, wallet_names_json, alerted_at, signal_origin, radar_score
      FROM signals WHERE alert_status != 'suppressed' AND signal_origin != 'radar' AND market_cap > 0 AND market_cap < ?
      AND NOT EXISTS (SELECT 1 FROM market_reviews mr WHERE mr.chain = signals.chain AND mr.token_address = signals.token_address AND (mr.status = 'suppressed' OR (mr.market_cap IS NOT NULL AND mr.market_cap >= ?)))
      ORDER BY alerted_at DESC,id DESC LIMIT 21`).bind(cap, cap).all<Record<string, unknown>>();
    const [run, chainRows, sourceRows, alertRows] = await Promise.all([
      db.prepare("SELECT status, finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ status: string; finished_at: string }>(),
      db.prepare("SELECT chain, status, finished_at FROM monitor_runs WHERE chain != '' AND id IN (SELECT MAX(id) FROM monitor_runs WHERE chain != '' GROUP BY chain)").all<Record<string, unknown>>(),
      db.prepare("SELECT source, chain, status, last_attempt_at, last_success_at, last_error, consecutive_failures, next_retry_at, impact, last_latency_ms FROM source_health ORDER BY source, chain").all<Record<string, unknown>>(),
      db.prepare("SELECT alert_status, COUNT(*) count FROM signals WHERE threshold > 0 AND alert_status IN ('pending','retry','manual_review') GROUP BY alert_status").all<Record<string, unknown>>(),
    ]);
    return {
      signals: rows.results.slice(0, 20).map((row) => {
        const identity = verifiedTokenIdentity(String(row.chain), String(row.token_address), String(row.name), String(row.symbol));
        return ({
        id: Number(row.id), chain: String(row.chain), tokenAddress: String(row.token_address), name: identity.name, symbol: identity.symbol, logo: String(row.logo || ""),
        threshold: Number(row.threshold), holderCount: Number(row.holder_count), price: Number(row.price), marketCap: Number(row.market_cap), liquidity: Number(row.liquidity),
        holders: Number(row.holders), volume24h: Number(row.volume_24h), gmgnTheme: String(row.gmgn_theme), aiAnalysis: String(row.ai_analysis),
        walletNames: JSON.parse(String(row.wallet_names_json || "[]")), createdAt: String(row.alerted_at), signalOrigin: String(row.signal_origin || "kol_monitor"), radarScore: row.radar_score === null || row.radar_score === undefined ? null : Number(row.radar_score),
      }); }).filter((signal) => !isRejectedTokenIdentity(signal.chain, signal.tokenAddress) && !isMatureBaseAsset(signal.symbol)),
      nextCursor: rows.results.length > 20 ? encodeSignalCursor({ alertedAt: String(rows.results[19].alerted_at), id: Number(rows.results[19].id) }) : null,
      lastRun: run?.finished_at ?? null,
      monitorOk: run?.status === "success",
      chainHealth: buildChainHealth(chainRows.results), sourceHealth: buildSourceHealth(sourceRows.results), alertSummary: buildAlertSummary(alertRows.results),
    };
  } catch {
    return { signals: [], nextCursor: null, lastRun: null, monitorOk: false, chainHealth: buildChainHealth([]), sourceHealth: [], alertSummary: buildAlertSummary([]) };
  }
}

export default async function Home() {
  const result = await loadSignals();
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  return <Dashboard signals={result.signals} initialNextCursor={result.nextCursor} walletCount={watchedWallets.length} lastRun={result.lastRun} monitorOk={result.monitorOk} demo={!result.signals.length} liveMarketEnabled={flags.liveMarket} chainHealth={result.chainHealth} sourceHealth={result.sourceHealth} alertSummary={result.alertSummary} />;
}
