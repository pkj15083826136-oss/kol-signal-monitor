import { hardFilter } from "@/lib/radar/policy";
import { existingSignalCandidate } from "@/lib/radar/adapters/existing-signals";

export type RadarViewRow = {
  id: string; chain: string; tokenAddress: string; pairAddress: string | null; name: string; symbol: string; status: string; signalSource: string; signalType: string;
  firstSeenAt: string; poolCreatedAt: string | null; price: string | null; marketCap: number | null; liquidity: number | null; volume24h: number | null; holders: number | null;
  buyers: number | null; sellers: number | null; smartMoneyCount: number; securityScore: number; narrativeScore: number; momentumScore: number; totalScore: number;
  aiDecision: string; aiConfidence: number; aiReason: string; paperEntered: boolean; autoBuyTriggered: boolean; plannedBuyUsd: string | null; executedPrice: string | null;
  currentReturnBps: number | null; maxReturnBps: number | null; takeProfitCount: number; remainingPosition: string | null; rejectReason: string | null; dataFreshnessMs: number | null; sourceStatus: string;
};

export type RadarDashboardData = { rows: RadarViewRow[]; paperOrders: Array<Record<string, unknown>>; positions: Array<Record<string, unknown>>; usingFallback: boolean; aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT"; fetchedAt: string };

function optionalNumber(value: unknown) { const parsed = Number(value); return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed; }

function mapRadar(row: Record<string, unknown>): RadarViewRow {
  return { id: `radar:${row.id}`, chain: String(row.chain), tokenAddress: String(row.token_address), pairAddress: row.pair_address ? String(row.pair_address) : null, name: String(row.name || "Unknown"), symbol: String(row.symbol || "—"), status: String(row.status), signalSource: String(row.signal_source || "radar"), signalType: String(row.signal_type || "candidate"), firstSeenAt: String(row.first_seen_at), poolCreatedAt: row.pool_created_at ? String(row.pool_created_at) : null, price: row.price ? String(row.price) : null, marketCap: optionalNumber(row.market_cap), liquidity: optionalNumber(row.liquidity), volume24h: optionalNumber(row.volume_24h), holders: optionalNumber(row.holders), buyers: optionalNumber(row.buyers), sellers: optionalNumber(row.sellers), smartMoneyCount: Number(row.smart_money_count || 0), securityScore: Number(row.security_score || 0), narrativeScore: Number(row.narrative_score || 0), momentumScore: Number(row.momentum_score || 0), totalScore: Number(row.total_score || 0), aiDecision: String(row.ai_decision || "HOLD"), aiConfidence: Number(row.ai_confidence || 0), aiReason: String(row.ai_reason || "证据不足，继续观察"), paperEntered: Boolean(row.paper_position_id), autoBuyTriggered: false, plannedBuyUsd: row.planned_buy_usd ? String(row.planned_buy_usd) : null, executedPrice: row.executed_price ? String(row.executed_price) : null, currentReturnBps: optionalNumber(row.current_return_bps), maxReturnBps: optionalNumber(row.max_return_bps), takeProfitCount: Number(row.take_profit_count || 0), remainingPosition: row.remaining_quantity ? String(row.remaining_quantity) : null, rejectReason: row.reject_reason ? String(row.reject_reason) : null, dataFreshnessMs: optionalNumber(row.data_freshness_ms), sourceStatus: String(row.source_status_json || "{}") };
}

function mapFallback(row: Record<string, unknown>, now: string): RadarViewRow {
  const candidate = existingSignalCandidate(row, now); const filter = hardFilter(candidate, undefined, Date.parse(now));
  return { id: `signal:${row.id}`, chain: candidate.chain, tokenAddress: candidate.tokenAddress, pairAddress: null, name: candidate.name, symbol: candidate.symbol, status: "observing", signalSource: "GMGN KOL聚集（备用发现）", signalType: "smart_money_cluster", firstSeenAt: candidate.firstSeenAt, poolCreatedAt: null, price: candidate.price, marketCap: candidate.marketCap, liquidity: candidate.liquidity, volume24h: candidate.volume24h, holders: candidate.holders, buyers: null, sellers: null, smartMoneyCount: candidate.smartMoneyCount, securityScore: 0, narrativeScore: 0, momentumScore: 0, totalScore: 0, aiDecision: "HOLD", aiConfidence: 0, aiReason: "安全模拟、Pair与合约权限数据尚未齐全，默认观察。", paperEntered: false, autoBuyTriggered: false, plannedBuyUsd: null, executedPrice: null, currentReturnBps: null, maxReturnBps: null, takeProfitCount: 0, remainingPosition: null, rejectReason: filter.reasons.join("；"), dataFreshnessMs: Math.max(0, Date.parse(now) - Date.parse(candidate.dataFetchedAt)), sourceStatus: JSON.stringify({ gmgn: "fallback_discovery", aveSmart: "BLOCKED_EXTERNAL_ENDPOINT" }) };
}

export async function loadRadarDashboard(db: D1Database): Promise<RadarDashboardData> {
  const now = new Date().toISOString();
  const [radar, positions, orders] = await Promise.all([
    db.prepare(`SELECT r.*, (SELECT source FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1) signal_source,
      p.id paper_position_id, p.remaining_quantity, p.take_profit_count,
      CASE WHEN CAST(p.net_cost_usd AS REAL)>0 THEN CAST((CAST(p.current_executable_value_usd AS REAL)-CAST(p.net_cost_usd AS REAL))*10000/CAST(p.net_cost_usd AS REAL) AS INTEGER) END current_return_bps,
      (SELECT MAX(max_upside_bps) FROM trade_outcomes o WHERE o.radar_signal_id=r.id) max_return_bps,
      (SELECT executable_price FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' AND po.status='filled' ORDER BY po.id ASC LIMIT 1) executed_price,
      (SELECT gross_usd FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' ORDER BY po.id ASC LIMIT 1) planned_buy_usd
      FROM radar_signals r LEFT JOIN paper_positions p ON p.radar_signal_id=r.id ORDER BY r.first_seen_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare("SELECT id, radar_signal_id, chain, token_address, status, net_cost_usd, realized_usd, current_executable_value_usd, peak_executable_value_usd, take_profit_count, remaining_quantity, opened_at, closed_at FROM paper_positions ORDER BY updated_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare("SELECT id, radar_signal_id, side, reason, requested_quantity, filled_quantity, net_usd, status, failure_reason, attempt_count, created_at FROM paper_orders ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>(),
  ]);
  if (radar.results.length) return { rows: radar.results.map(mapRadar), paperOrders: orders.results, positions: positions.results, usingFallback: false, aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT", fetchedAt: now };
  const fallback = await db.prepare(`SELECT id, chain, token_address, name, symbol, price, market_cap, liquidity, holders, volume_24h, holder_count, alerted_at
    FROM signals WHERE alert_status != 'suppressed' ORDER BY alerted_at DESC LIMIT 40`).all<Record<string, unknown>>();
  return { rows: fallback.results.map((row) => mapFallback(row, now)), paperOrders: orders.results, positions: positions.results, usingFallback: true, aveSmartStatus: "BLOCKED_EXTERNAL_ENDPOINT", fetchedAt: now };
}
