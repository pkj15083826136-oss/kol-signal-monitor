import type { NarrativeEvidence, TradeCheck } from "@/lib/radar/types";

export type RadarViewRow = {
  id: string; chain: string; tokenAddress: string; pairAddress: string | null; dexId: string | null; sourcePairLabel: string | null; identityStatus: string;
  name: string; symbol: string; status: string; signalSource: string; signalType: string; firstSeenAt: string; poolCreatedAt: string | null;
  price: string | null; marketCap: number | null; liquidity: number | null; volume24h: number | null; holders: number | null; buyers: number | null; sellers: number | null; smartMoneyCount: number;
  securityScore: number; narrativeScore: number | null; narrativeStatus: string; narrativeSummary: string; narrativeFreshness: number | null; narrativeSentiment: number | null; narrativeLead: number | null; narrativeStage: string; narrativeEvidence: NarrativeEvidence[];
  momentumScore: number; totalScore: number; aiDecision: string; aiConfidence: number; tradeStatus: string; tradeShortReason: string; tradeChecks: TradeCheck[]; riskComments: string[];
  paperEntered: boolean; autoBuyTriggered: boolean; plannedBuyUsd: string | null; executedPrice: string | null; currentReturnBps: number | null; maxReturnBps: number | null; takeProfitCount: number; remainingPosition: string | null;
  rejectReason: string | null; dataFreshnessMs: number | null; sourceStatus: string; rawInput: string;
};
export type RadarDashboardData = { rows: RadarViewRow[]; paperOrders: Array<Record<string, unknown>>; positions: Array<Record<string, unknown>>; usingFallback: boolean; aveSmartStatus: "READY_BROWSER_COLLECTOR" | "BLOCKED_EXTERNAL_ENDPOINT"; gmgnTianyanStatus: "GMGN_TIAN_YAN_BLOCKED" | "READY"; fetchedAt: string };

function optionalNumber(value: unknown) { const parsed = Number(value); return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed; }
function jsonArray<T>(value: unknown): T[] { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
function mapRadar(row: Record<string, unknown>): RadarViewRow {
  return {
    id: `radar:${row.id}`, chain: String(row.chain), tokenAddress: String(row.token_address), pairAddress: row.pair_address ? String(row.pair_address) : null,
    dexId: row.dex_id ? String(row.dex_id) : null, sourcePairLabel: row.source_pair_label ? String(row.source_pair_label) : null, identityStatus: String(row.trade_identity_status || row.identity_status || "UNVERIFIED"),
    name: String(row.name || "Unknown"), symbol: String(row.symbol || "—"), status: String(row.status), signalSource: String(row.signal_source || "radar"), signalType: String(row.signal_type || "candidate"), firstSeenAt: String(row.first_seen_at), poolCreatedAt: row.pool_created_at ? String(row.pool_created_at) : null,
    price: row.price ? String(row.price) : null, marketCap: optionalNumber(row.market_cap), liquidity: optionalNumber(row.liquidity), volume24h: optionalNumber(row.volume_24h), holders: optionalNumber(row.holders), buyers: optionalNumber(row.buyers), sellers: optionalNumber(row.sellers), smartMoneyCount: Number(row.smart_money_count || 0),
    securityScore: Number(row.security_score || 0), narrativeScore: optionalNumber(row.narrative_score_v2), narrativeStatus: String(row.narrative_analysis_status || row.narrative_status || "PENDING"), narrativeSummary: String(row.narrative_analysis_summary || row.narrative_summary || "AI叙事分析中"), narrativeFreshness: optionalNumber(row.freshness_score), narrativeSentiment: optionalNumber(row.sentiment_score), narrativeLead: optionalNumber(row.lead_score), narrativeStage: String(row.narrative_stage || "unknown"), narrativeEvidence: jsonArray<NarrativeEvidence>(row.evidence_json),
    momentumScore: Number(row.momentum_score || 0), totalScore: Number(row.total_score || 0), aiDecision: String(row.ai_decision || "HOLD"), aiConfidence: Number(row.ai_confidence || 0), tradeStatus: String(row.trade_status || "UNKNOWN"), tradeShortReason: String(row.trade_short_reason || "交易条件待补全"), tradeChecks: jsonArray<TradeCheck>(row.checks_json), riskComments: jsonArray<string>(row.risk_comments_json),
    paperEntered: Boolean(row.paper_position_id), autoBuyTriggered: false, plannedBuyUsd: row.planned_buy_usd ? String(row.planned_buy_usd) : null, executedPrice: row.executed_price ? String(row.executed_price) : null, currentReturnBps: optionalNumber(row.current_return_bps), maxReturnBps: optionalNumber(row.max_return_bps), takeProfitCount: Number(row.take_profit_count || 0), remainingPosition: row.remaining_quantity ? String(row.remaining_quantity) : null,
    rejectReason: row.reject_reason ? String(row.reject_reason) : null, dataFreshnessMs: optionalNumber(row.data_freshness_ms), sourceStatus: String(row.source_status_json || "{}"), rawInput: String(row.raw_input_json || "{}"),
  };
}

export async function loadRadarDashboard(db: D1Database): Promise<RadarDashboardData> {
  const now = new Date().toISOString();
  const [radar, positions, orders] = await Promise.all([
    db.prepare(`SELECT r.*, (SELECT source FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1) signal_source,
      n.status narrative_analysis_status,n.summary narrative_analysis_summary,n.freshness_score,n.sentiment_score,n.lead_score,n.stage narrative_stage,n.evidence_json,
      t.status trade_status,t.identity_status trade_identity_status,t.short_reason trade_short_reason,t.checks_json,t.risk_comments_json,
      p.id paper_position_id,p.remaining_quantity,p.take_profit_count,
      CASE WHEN CAST(p.net_cost_usd AS REAL)>0 THEN CAST((CAST(p.current_executable_value_usd AS REAL)-CAST(p.net_cost_usd AS REAL))*10000/CAST(p.net_cost_usd AS REAL) AS INTEGER) END current_return_bps,
      (SELECT MAX(max_upside_bps) FROM trade_outcomes o WHERE o.radar_signal_id=r.id) max_return_bps,
      (SELECT executable_price FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' AND po.status='filled' ORDER BY po.id ASC LIMIT 1) executed_price,
      (SELECT gross_usd FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' ORDER BY po.id ASC LIMIT 1) planned_buy_usd
      FROM radar_signals r
      LEFT JOIN radar_narrative_analysis n ON n.id=(SELECT id FROM radar_narrative_analysis WHERE radar_signal_id=r.id ORDER BY updated_at DESC LIMIT 1)
      LEFT JOIN radar_trade_eligibility t ON t.radar_signal_id=r.id
      LEFT JOIN paper_positions p ON p.radar_signal_id=r.id ORDER BY r.first_seen_at DESC LIMIT 100`).all<Record<string, unknown>>(),
    db.prepare("SELECT id, radar_signal_id, chain, token_address, status, net_cost_usd, realized_usd, current_executable_value_usd, peak_executable_value_usd, take_profit_count, remaining_quantity, opened_at, closed_at FROM paper_positions ORDER BY updated_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare("SELECT id, radar_signal_id, side, reason, requested_quantity, filled_quantity, net_usd, status, failure_reason, attempt_count, created_at FROM paper_orders ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>(),
  ]);
  return { rows: radar.results.map(mapRadar), paperOrders: orders.results, positions: positions.results, usingFallback: false, aveSmartStatus: "READY_BROWSER_COLLECTOR", gmgnTianyanStatus: "GMGN_TIAN_YAN_BLOCKED", fetchedAt: now };
}
