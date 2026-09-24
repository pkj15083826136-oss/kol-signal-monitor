import { env } from "cloudflare:workers";
import { MIN_FLOW_USD } from "@/lib/fund-flows";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.DB) return Response.json({ events: [], aggregates: [], health: [], coverage: "database_unavailable", minimumUsd: MIN_FLOW_USD }, { status: 503 });
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase().slice(0, 16);
  const chain = (url.searchParams.get("chain") || "").trim().toLowerCase().slice(0, 30);
  const exchange = (url.searchParams.get("exchange") || "").trim().slice(0, 60);
  const window = url.searchParams.get("window") === "1h" ? 1 : 24;
  const from = new Date(Date.now() - window * 3_600_000).toISOString();
  const bitqueryApproved = String((env as unknown as Record<string, unknown>).BITQUERY_PUBLIC_DISTRIBUTION_APPROVED || "").toLowerCase() === "true";
  const conditions = ["chain_occurred_at>=?"];
  const binds: unknown[] = [from];
  if (!bitqueryApproved) conditions.push("provider!='bitquery'");
  if (symbol) { conditions.push("symbol=?"); binds.push(symbol); }
  if (chain) { conditions.push("chain=?"); binds.push(chain); }
  if (exchange) { conditions.push("(from_entity LIKE ? OR to_entity LIKE ?)"); binds.push(`%${exchange}%`, `%${exchange}%`); }
  const where = conditions.join(" AND ");
  const [events, aggregates, health] = await Promise.all([
    env.DB.prepare(`SELECT * FROM fund_flow_events WHERE ${where} ORDER BY chain_occurred_at DESC,id DESC LIMIT 100`).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT symbol,chain,COALESCE(CASE WHEN direction='inflow' THEN to_entity ELSE from_entity END,'归属待核实') entity,SUM(CASE WHEN counts_toward_netflow=1 AND direction='inflow' THEN amount_usd ELSE 0 END) inflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd ELSE 0 END) outflow_usd,SUM(CASE WHEN counts_toward_netflow=1 AND direction='outflow' THEN amount_usd WHEN counts_toward_netflow=1 AND direction='inflow' THEN -amount_usd ELSE 0 END) net_outflow_usd,COUNT(*) event_count FROM fund_flow_events WHERE ${where} GROUP BY symbol,chain,entity ORDER BY ABS(net_outflow_usd) DESC LIMIT 100`).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT * FROM fund_flow_collector_state ORDER BY source").all<Record<string, unknown>>(),
  ]);
  return Response.json({ events: events.results, aggregates: aggregates.results, health: health.results, window: `${window}h`, minimumUsd: MIN_FLOW_USD, signConvention: "净额=流出-流入；正数表示净流出交易所，负数表示净流入交易所。桥接、交易所内部及同实体划转不计入。", institutionTradeCoverage: "机构买卖仅统计可验证成交；当前转账流不推断为买入或卖出。", fetchedAt: new Date().toISOString() });
}
