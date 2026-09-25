import { env } from "cloudflare:workers";
import { MIN_FLOW_USD } from "@/lib/fund-flows";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ events: [], mintEvents: [], aggregates: [], health: [], coverage: "database_unavailable", minimumUsd: MIN_FLOW_USD }, { status: 503 });
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase().slice(0, 16);
  const chainInput = (url.searchParams.get("chain") || "").trim().toLowerCase().slice(0, 30);
  const chain = chainInput === "以太坊" ? "ethereum" : chainInput;
  const exchange = (url.searchParams.get("exchange") || "").trim().slice(0, 60);
  const window = url.searchParams.get("window") === "1h" ? 1 : 24;
  const from = new Date(Date.now() - window * 3_600_000).toISOString();
  const mintFrom = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const bitqueryApproved = String((env as unknown as Record<string, unknown>).BITQUERY_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
  const conditions = ["chain_occurred_at>=?"];
  const binds: unknown[] = [from];
  if (!bitqueryApproved) conditions.push("provider!='bitquery'");
  if (symbol) { conditions.push("symbol=?"); binds.push(symbol); }
  if (chain) { conditions.push("chain=?"); binds.push(chain); }
  if (exchange) { conditions.push("(from_entity LIKE ? OR to_entity LIKE ?)"); binds.push(`%${exchange}%`, `%${exchange}%`); }
  const where = conditions.join(" AND ");
  const mintConditions = ["chain_occurred_at>=?", "verification_status='verified_supply_increase'"]; const mintBinds: unknown[] = [mintFrom];
  if (symbol) { if (["USDT", "USDC"].includes(symbol)) { mintConditions.push("symbol=?"); mintBinds.push(symbol); } else mintConditions.push("1=0"); }
  const [events, mintEvents, aggregates, health, filteredStats, totalStats] = await Promise.all([
    env.DB.prepare(`SELECT * FROM fund_flow_events WHERE ${where} ORDER BY chain_occurred_at DESC,id DESC LIMIT 100`).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT * FROM stablecoin_mint_events WHERE ${mintConditions.join(" AND ")} ORDER BY chain_occurred_at DESC,id DESC LIMIT 100`).bind(...mintBinds).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT symbol,chain,COALESCE(CASE WHEN direction='inflow' THEN to_entity ELSE from_entity END,'归属待核实') entity,SUM(CASE WHEN counts_toward_netflow=1 AND direction='inflow' THEN amount_usd ELSE 0 END) inflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd ELSE 0 END) outflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd WHEN counts_toward_netflow=1 AND direction='inflow' THEN -amount_usd ELSE 0 END) net_outflow_usd,COUNT(*) event_count FROM fund_flow_events WHERE ${where} GROUP BY symbol,chain,entity ORDER BY ABS(net_outflow_usd) DESC LIMIT 100`).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT * FROM fund_flow_collector_state ORDER BY source").all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) record_count,MAX(chain_occurred_at) latest_event_at,MAX(discovered_at) latest_discovered_at FROM fund_flow_events WHERE ${where}`).bind(...binds).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT COUNT(*) total_verified_records FROM fund_flow_events WHERE provider='public_rpc'").first<Record<string, unknown>>(),
  ]);
  return Response.json({ events: events.results, mintEvents: mintEvents.results, aggregates: aggregates.results, health: health.results, recordCount: Number(filteredStats?.record_count || 0), totalVerifiedRecords: Number(totalStats?.total_verified_records || 0), latestEventAt: filteredStats?.latest_event_at || null, latestDiscoveredAt: filteredStats?.latest_discovered_at || null, window: `${window}h`, minimumUsd: MIN_FLOW_USD, signConvention: "净额=流出-流入；正数表示净流出交易所，负数表示净流入交易所。桥接、交易所内部及同实体划转不计入。", institutionTradeCoverage: "机构买卖仅统计可验证成交；当前转账流不推断为买入或卖出。", fetchedAt: new Date().toISOString() });
}
