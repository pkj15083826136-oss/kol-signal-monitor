import { env } from "cloudflare:workers";
import FlowDashboard, { type FlowAggregate, type FlowEvent, type FlowHealth, type FlowPayload } from "./flow-dashboard";

export const dynamic = "force-dynamic";

async function load(): Promise<FlowPayload> {
  if (!env.DB) return { events: [], aggregates: [], health: [], recordCount: 0, totalVerifiedRecords: 0, latestEventAt: null, latestDiscoveredAt: null, window: "24h", minimumUsd: 10_000_000, signConvention: "净额=流出-流入", institutionTradeCoverage: "覆盖不足", fetchedAt: new Date().toISOString() };
  const from = new Date(Date.now() - 86_400_000).toISOString();
  const bitqueryApproved = String((env as unknown as Record<string, unknown>).BITQUERY_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
  const providerClause = bitqueryApproved ? "" : "AND provider!='bitquery'";
  const [events, aggregates, health, filteredStats, totalStats] = await Promise.all([
    env.DB.prepare(`SELECT * FROM fund_flow_events WHERE chain_occurred_at>=? ${providerClause} ORDER BY chain_occurred_at DESC LIMIT 100`).bind(from).all<FlowEvent>(),
    env.DB.prepare(`SELECT symbol,chain,COALESCE(CASE WHEN direction='inflow' THEN to_entity ELSE from_entity END,'归属待核实') entity,SUM(CASE WHEN counts_toward_netflow=1 AND direction='inflow' THEN amount_usd ELSE 0 END) inflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd ELSE 0 END) outflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd WHEN counts_toward_netflow=1 AND direction='inflow' THEN -amount_usd ELSE 0 END) net_outflow_usd,COUNT(*) event_count FROM fund_flow_events WHERE chain_occurred_at>=? ${providerClause} GROUP BY symbol,chain,entity ORDER BY ABS(net_outflow_usd) DESC LIMIT 100`).bind(from).all<FlowAggregate>(),
    env.DB.prepare("SELECT * FROM fund_flow_collector_state ORDER BY source").all<FlowHealth>(),
    env.DB.prepare(`SELECT COUNT(*) record_count,MAX(chain_occurred_at) latest_event_at,MAX(discovered_at) latest_discovered_at FROM fund_flow_events WHERE chain_occurred_at>=? ${providerClause}`).bind(from).first<{ record_count: number; latest_event_at: string | null; latest_discovered_at: string | null }>(),
    env.DB.prepare("SELECT COUNT(*) total_verified_records FROM fund_flow_events WHERE provider='public_rpc'").first<{ total_verified_records: number }>(),
  ]);
  return { events: events.results, aggregates: aggregates.results, health: health.results, recordCount: Number(filteredStats?.record_count || 0), totalVerifiedRecords: Number(totalStats?.total_verified_records || 0), latestEventAt: filteredStats?.latest_event_at || null, latestDiscoveredAt: filteredStats?.latest_discovered_at || null, window: "24h", minimumUsd: 10_000_000, signConvention: "净额=流出-流入；正数表示净流出交易所，负数表示净流入交易所。", institutionTradeCoverage: "机构买卖只统计可验证成交；转账不会推断为已买入或已卖出。", fetchedAt: new Date().toISOString() };
}

export default async function Page() { return <FlowDashboard initial={await load()} />; }
