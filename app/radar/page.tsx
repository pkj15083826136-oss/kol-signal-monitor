import { env } from "cloudflare:workers";
import RadarDashboard from "./radar-dashboard";
import { loadRadarDashboard } from "@/lib/radar/view";
import { tradingFeatureFlags } from "@/lib/feature-flags";
import { emptyLearningSummary } from "@/lib/radar/learning";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  const empty = { rows: [], paperOrders: [], positions: [], learning: emptyLearningSummary(), usingFallback: false, aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT", aveSmartLastHeartbeatAt: null, gmgnTianyanStatus: "GMGN_TIAN_YAN_BLOCKED" as const, fetchedAt: new Date().toISOString() };
  const data = env.DB ? await loadRadarDashboard(env.DB).catch(() => empty) : empty;
  return <RadarDashboard initial={data} walletLoginEnabled={flags.radarWalletLogin} autoTradeEnabled={flags.radarAutoTrade} walletConnectEnabled={flags.walletConnect} />;
}
