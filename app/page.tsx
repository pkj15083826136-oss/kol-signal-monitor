import { env } from "cloudflare:workers";
import Dashboard, { type SignalRow } from "./dashboard";
import { watchedWallets } from "@/lib/wallets";
import { isRejectedTokenIdentity, verifiedTokenIdentity } from "@/lib/token-identity";
import { isMatureBaseAsset } from "@/lib/signal-policy";
import { buildAlertSummary, buildChainHealth, buildSourceHealth, type AlertSummary, type ChainHealth, type SourceHealth } from "@/lib/ops-status";
import { tradingFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

async function loadSignals(): Promise<{ signals: SignalRow[]; lastRun: string | null; monitorOk: boolean; chainHealth: ChainHealth[]; sourceHealth: SourceHealth[]; alertSummary: AlertSummary }> {
  try {
    const db = env.DB;
    if (!db) throw new Error("DB binding 未配置");
    const rows = await db.prepare(`SELECT id, chain, token_address, name, symbol, logo, threshold, holder_count, market_cap,
      liquidity, holders, volume_24h, gmgn_theme, ai_analysis, wallet_names_json, alerted_at
      FROM signals WHERE alert_status != 'suppressed' ORDER BY alerted_at DESC LIMIT 60`).all<Record<string, unknown>>();
    const [run, chainRows, sourceRows, alertRows] = await Promise.all([
      db.prepare("SELECT status, finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ status: string; finished_at: string }>(),
      db.prepare("SELECT chain, status, finished_at FROM monitor_runs WHERE chain != '' AND id IN (SELECT MAX(id) FROM monitor_runs WHERE chain != '' GROUP BY chain)").all<Record<string, unknown>>(),
      db.prepare("SELECT source, chain, status, last_attempt_at, last_latency_ms FROM source_health ORDER BY source, chain").all<Record<string, unknown>>(),
      db.prepare("SELECT alert_status, COUNT(*) count FROM signals WHERE alert_status IN ('pending','retry','manual_review') GROUP BY alert_status").all<Record<string, unknown>>(),
    ]);
    return {
      signals: rows.results.map((row) => {
        const identity = verifiedTokenIdentity(String(row.chain), String(row.token_address), String(row.name), String(row.symbol));
        return ({
        id: Number(row.id), chain: String(row.chain), tokenAddress: String(row.token_address), name: identity.name, symbol: identity.symbol, logo: String(row.logo || ""),
        threshold: Number(row.threshold), holderCount: Number(row.holder_count), marketCap: Number(row.market_cap), liquidity: Number(row.liquidity),
        holders: Number(row.holders), volume24h: Number(row.volume_24h), gmgnTheme: String(row.gmgn_theme), aiAnalysis: String(row.ai_analysis),
        walletNames: JSON.parse(String(row.wallet_names_json || "[]")), createdAt: String(row.alerted_at),
      }); }).filter((signal) => !isRejectedTokenIdentity(signal.chain, signal.tokenAddress) && !isMatureBaseAsset(signal.symbol)),
      lastRun: run?.finished_at ?? null,
      monitorOk: run?.status === "success",
      chainHealth: buildChainHealth(chainRows.results), sourceHealth: buildSourceHealth(sourceRows.results), alertSummary: buildAlertSummary(alertRows.results),
    };
  } catch {
    return { signals: [], lastRun: null, monitorOk: false, chainHealth: buildChainHealth([]), sourceHealth: [], alertSummary: buildAlertSummary([]) };
  }
}

export default async function Home() {
  const result = await loadSignals();
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  return <Dashboard signals={result.signals} walletCount={watchedWallets.length} lastRun={result.lastRun} monitorOk={result.monitorOk} demo={!result.signals.length} liveMarketEnabled={flags.liveMarket} chainHealth={result.chainHealth} sourceHealth={result.sourceHealth} alertSummary={result.alertSummary} />;
}
