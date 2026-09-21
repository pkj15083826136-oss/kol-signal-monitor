import { env } from "cloudflare:workers";
import RadarDashboard from "./radar-dashboard";
import { loadRadarDashboard } from "@/lib/radar/view";
import { tradingFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const flags = tradingFeatureFlags(env as unknown as Record<string, string | undefined>);
  const data = env.DB ? await loadRadarDashboard(env.DB).catch(() => ({ rows: [], paperOrders: [], positions: [], usingFallback: false, aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT" as const, fetchedAt: new Date().toISOString() })) : { rows: [], paperOrders: [], positions: [], usingFallback: false, aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT" as const, fetchedAt: new Date().toISOString() };
  return <RadarDashboard initial={data} walletLoginEnabled={flags.radarWalletLogin} autoTradeEnabled={flags.radarAutoTrade} walletConnectEnabled={flags.walletConnect} />;
}
