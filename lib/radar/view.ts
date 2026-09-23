import type { NarrativeEvidence, TradeCheck } from "@/lib/radar/types";
import { collectorDisplayState, emptyLearningSummary, type LearningSummary, type OutcomeGroup, type PromptState } from "@/lib/radar/learning";
import { isSearchActionDescription, safeXPostUrl } from "@/lib/radar/ai";
import { identiconUrl, leadTimingFromScore, normalizePropagationStage } from "@/lib/radar/enrichment";

export type RadarViewRow = {
  id: string; chain: string; tokenAddress: string; pairAddress: string | null; dexId: string | null; sourcePairLabel: string | null; identityStatus: string;
  name: string; symbol: string; status: string; signalSource: string; signalType: string; firstSeenAt: string; poolCreatedAt: string | null;
  price: string | null; marketCap: number | null; liquidity: number | null; volume24h: number | null; holders: number | null; buyers: number | null; sellers: number | null; smartMoneyCount: number;
  securityScore: number; narrativeScore: number | null; narrativeStatus: string; narrativeSummary: string; narrativeFreshness: number | null; narrativeSentiment: number | null; narrativeLead: number | null; narrativeStage: string; narrativeEvidence: NarrativeEvidence[];
  memePotentialScore: number | null; catalystEvidenceScore: number | null; sourceProjectDescription: string | null; sourceDescriptionAt: string | null; sourceDescriptionSource: string | null;
  xSearchCalls: number | null; xPostsFetched: number | null; xUsersFetched: number | null; xCostUsd: number | null; xFetchStatus: string;
  momentumScore: number; totalScore: number; aiDecision: string; aiConfidence: number; tradeStatus: string; tradeShortReason: string; tradeChecks: TradeCheck[]; riskComments: string[];
  paperEntered: boolean; autoBuyTriggered: boolean; plannedBuyUsd: string | null; executedPrice: string | null; currentReturnBps: number | null; maxReturnBps: number | null; takeProfitCount: number; remainingPosition: string | null;
  rejectReason: string | null; dataFreshnessMs: number | null; sourceStatus: string; rawInput: string;
  avatarUrl: string; avatarStatus: string; enrichmentStatus: string; enrichmentError: string | null; tradeDataStage: string; pairStatus: string; pairSource: string | null; liquidityStatus: string; liquiditySource: string | null;
  uniqueBuyers24h: number | null; uniqueSellers24h: number | null; buyTx24h: number | null; sellTx24h: number | null; tokenCreatedAt: string | null; systemFirstSeenAt: string; propagationStage: string; leadTiming: string; sourceEventCount: number; sourceFirstAt: string; sourceLastAt: string; sourceRepeatCount: number;
};
export type ProviderHealth = { endpoint: string; calls: number; successes: number; failures: number; lastAt: string | null };
export type RadarDashboardData = { rows: RadarViewRow[]; totalCandidates: number; candidates24h: number; nextOffset: number | null; paperOrders: Array<Record<string, unknown>>; positions: Array<Record<string, unknown>>; learning: LearningSummary; usingFallback: boolean; aveSmartStatus: string; aveSmartLastHeartbeatAt: string | null; aveCollector: Record<string, unknown> | null; gmgnApiHealth: ProviderHealth[]; gmgnTianyanStatus: "GMGN_TIAN_YAN_BLOCKED" | "READY"; fetchedAt: string };

function optionalNumber(value: unknown) { const parsed = Number(value); return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed; }
function jsonArray<T>(value: unknown): T[] { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
function viewEvidence(value: unknown): NarrativeEvidence[] {
  return jsonArray<Record<string, unknown>>(value).flatMap((row) => {
    const summary = String(row.short_summary || row.reason || row.title || "").trim();
    if (!summary || isSearchActionDescription(summary)) return [];
    const sourceUrl = safeXPostUrl(row.source_url ?? row.url);
    return [{ source_url: sourceUrl, x_post_id: row.x_post_id ? String(row.x_post_id) : sourceUrl?.match(/\/status\/(\d+)/)?.[1] || null, author_handle: row.author_handle ? String(row.author_handle).replace(/^@/, "") : null, author_name: row.author_name ? String(row.author_name) : null, published_at: row.published_at ? String(row.published_at) : null, short_summary: summary, evidence_relation: String(row.evidence_relation || "THEME_CONTEXT") as NarrativeEvidence["evidence_relation"], relevance_score: Number(row.relevance_score || 0), engagement_metrics: row.engagement_metrics && typeof row.engagement_metrics === "object" ? row.engagement_metrics as Record<string, number> : {}, before_signal_cutoff: row.before_signal_cutoff === true || row.available_at_signal === true }];
  }).slice(0, 5);
}
function mapRadar(row: Record<string, unknown>): RadarViewRow {
  return {
    id: `radar:${row.id}`, chain: String(row.chain), tokenAddress: String(row.token_address), pairAddress: row.primary_pair_address ? String(row.primary_pair_address) : row.pair_address ? String(row.pair_address) : null,
    dexId: row.dex_id ? String(row.dex_id) : null, sourcePairLabel: row.source_pair_label ? String(row.source_pair_label) : null, identityStatus: String(row.trade_identity_status || row.identity_status || "UNVERIFIED"),
    name: String(row.name || "Unknown"), symbol: String(row.symbol || "—"), status: String(row.status), signalSource: String(row.signal_source || "radar"), signalType: String(row.signal_type || "candidate"), firstSeenAt: String(row.first_seen_at), poolCreatedAt: row.pool_created_at ? String(row.pool_created_at) : null,
    price: row.price ? String(row.price) : null, marketCap: optionalNumber(row.market_cap), liquidity: optionalNumber(row.enrichment_liquidity) ?? optionalNumber(row.liquidity), volume24h: optionalNumber(row.volume_24h), holders: optionalNumber(row.holders), buyers: optionalNumber(row.buyers), sellers: optionalNumber(row.sellers), smartMoneyCount: Number(row.smart_money_count || 0),
    securityScore: Number(row.security_score || 0), narrativeScore: optionalNumber(row.narrative_score_v2), narrativeStatus: String(row.narrative_analysis_status || row.narrative_status || "PENDING"), narrativeSummary: String(row.narrative_analysis_summary || row.narrative_summary || "AI叙事分析中"), narrativeFreshness: optionalNumber(row.freshness_score), narrativeSentiment: optionalNumber(row.sentiment_score), narrativeLead: optionalNumber(row.lead_score), narrativeStage: String(row.narrative_stage || "unknown"), narrativeEvidence: viewEvidence(row.evidence_json),
    memePotentialScore: optionalNumber(row.meme_potential_score), catalystEvidenceScore: optionalNumber(row.catalyst_evidence_score), sourceProjectDescription: row.source_project_description ? String(row.source_project_description) : null, sourceDescriptionAt: row.source_description_at ? String(row.source_description_at) : null, sourceDescriptionSource: row.source_description_source ? String(row.source_description_source) : null,
    xSearchCalls: optionalNumber(row.x_search_calls), xPostsFetched: optionalNumber(row.x_posts_fetched), xUsersFetched: optionalNumber(row.x_users_fetched), xCostUsd: row.cost_in_usd_ticks === null || row.cost_in_usd_ticks === undefined ? null : Number(row.cost_in_usd_ticks) / 10_000_000_000, xFetchStatus: String(row.fetch_status || "UNKNOWN"),
    momentumScore: Number(row.momentum_score || 0), totalScore: Number(row.total_score || 0), aiDecision: String(row.ai_decision || "HOLD"), aiConfidence: Number(row.ai_confidence || 0), tradeStatus: String(row.trade_status || "UNKNOWN"), tradeShortReason: String(row.trade_short_reason || "交易条件待补全"), tradeChecks: jsonArray<TradeCheck>(row.checks_json), riskComments: jsonArray<string>(row.risk_comments_json),
    paperEntered: Boolean(row.paper_position_id), autoBuyTriggered: false, plannedBuyUsd: row.planned_buy_usd ? String(row.planned_buy_usd) : null, executedPrice: row.executed_price ? String(row.executed_price) : null, currentReturnBps: optionalNumber(row.current_return_bps), maxReturnBps: optionalNumber(row.max_return_bps), takeProfitCount: Number(row.take_profit_count || 0), remainingPosition: row.remaining_quantity ? String(row.remaining_quantity) : null,
    rejectReason: row.reject_reason ? String(row.reject_reason) : null, dataFreshnessMs: optionalNumber(row.data_freshness_ms), sourceStatus: String(row.source_status_json || "{}"), rawInput: String(row.raw_input_json || "{}"),
    avatarUrl: String(row.avatar_resolved_url || identiconUrl(String(row.chain), String(row.token_address))), avatarStatus: String(row.avatar_status || "PENDING"), enrichmentStatus: String(row.enrichment_status || "PENDING"), enrichmentError: row.enrichment_error ? String(row.enrichment_error) : null, tradeDataStage: String(row.trade_data_stage || "CANDIDATE_ONLY"), pairStatus: String(row.pair_status || "PENDING"), pairSource: row.pair_source ? String(row.pair_source) : null, liquidityStatus: String(row.liquidity_status || "PENDING"), liquiditySource: row.liquidity_source ? String(row.liquidity_source) : null,
    uniqueBuyers24h: optionalNumber(row.unique_buyers_24h), uniqueSellers24h: optionalNumber(row.unique_sellers_24h), buyTx24h: optionalNumber(row.buy_tx_24h), sellTx24h: optionalNumber(row.sell_tx_24h), tokenCreatedAt: row.token_created_at ? String(row.token_created_at) : null, systemFirstSeenAt: String(row.system_first_seen_at || row.first_seen_at), propagationStage: normalizePropagationStage(row.narrative_stage, String(row.narrative_analysis_status || row.narrative_status), Number(row.evidence_count || 0)), leadTiming: leadTimingFromScore(optionalNumber(row.lead_score), String(row.narrative_analysis_status || row.narrative_status), Number(row.evidence_count || 0)), sourceEventCount: Number(row.source_event_count || 1), sourceFirstAt: String(row.source_first_at || row.first_seen_at), sourceLastAt: String(row.source_last_at || row.first_seen_at), sourceRepeatCount: Math.max(0, Number(row.source_event_count || 1) - 1),
  };
}

export async function loadRadarDashboard(db: D1Database, options: { offset?: number; limit?: number } = {}): Promise<RadarDashboardData> {
  const offset = Math.max(0, Math.floor(options.offset || 0)); const limit = Math.min(100, Math.max(10, Math.floor(options.limit || 40)));
  const now = new Date().toISOString();
  const [radar, totals, positions, orders, collector, gmgnHealth, sampleGroups, manualCases, promptVersions] = await Promise.all([
    db.prepare(`SELECT r.*, (SELECT source FROM radar_signal_sources s WHERE s.radar_signal_id=r.id ORDER BY observed_at ASC LIMIT 1) signal_source,
      n.status narrative_analysis_status,n.summary narrative_analysis_summary,n.freshness_score,n.sentiment_score,n.lead_score,n.stage narrative_stage,n.evidence_json,n.evidence_count,n.meme_potential_score,n.catalyst_evidence_score,n.x_search_calls,n.x_posts_fetched,n.x_users_fetched,n.cost_in_usd_ticks,n.fetch_status,
      t.status trade_status,t.identity_status trade_identity_status,t.short_reason trade_short_reason,t.checks_json,t.risk_comments_json,
      e.status enrichment_status,e.trade_data_stage,e.avatar_resolved_url,e.avatar_status,e.error_reason enrichment_error,e.primary_pair_address,e.pair_status,e.pair_source,e.liquidity_usd enrichment_liquidity,e.liquidity_status,e.liquidity_source,e.unique_buyers_24h,e.unique_sellers_24h,e.buy_tx_24h,e.sell_tx_24h,e.token_created_at,e.system_first_seen_at,
      (SELECT COUNT(*) FROM radar_signal_sources sx WHERE sx.radar_signal_id=r.id) source_event_count,(SELECT MIN(observed_at) FROM radar_signal_sources sx WHERE sx.radar_signal_id=r.id) source_first_at,(SELECT MAX(observed_at) FROM radar_signal_sources sx WHERE sx.radar_signal_id=r.id) source_last_at,
      p.id paper_position_id,p.remaining_quantity,p.take_profit_count,
      CASE WHEN CAST(p.net_cost_usd AS REAL)>0 THEN CAST((CAST(p.current_executable_value_usd AS REAL)-CAST(p.net_cost_usd AS REAL))*10000/CAST(p.net_cost_usd AS REAL) AS INTEGER) END current_return_bps,
      (SELECT MAX(max_upside_bps) FROM trade_outcomes o WHERE o.radar_signal_id=r.id) max_return_bps,
      (SELECT executable_price FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' AND po.status='filled' ORDER BY po.id ASC LIMIT 1) executed_price,
      (SELECT gross_usd FROM paper_orders po WHERE po.radar_signal_id=r.id AND po.side='buy' ORDER BY po.id ASC LIMIT 1) planned_buy_usd
      FROM radar_signals r
      LEFT JOIN radar_narrative_analysis n ON n.id=(SELECT id FROM radar_narrative_analysis WHERE radar_signal_id=r.id ORDER BY updated_at DESC LIMIT 1)
      LEFT JOIN radar_trade_eligibility t ON t.radar_signal_id=r.id
      LEFT JOIN radar_enrichment_state e ON e.radar_signal_id=r.id
      LEFT JOIN paper_positions p ON p.radar_signal_id=r.id ORDER BY r.first_seen_at DESC LIMIT ? OFFSET ?`).bind(limit, offset).all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN first_seen_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) recent FROM radar_signals").first<{ total: number; recent: number }>(),
    db.prepare("SELECT id, radar_signal_id, chain, token_address, status, net_cost_usd, realized_usd, current_executable_value_usd, peak_executable_value_usd, take_profit_count, remaining_quantity, opened_at, closed_at FROM paper_positions ORDER BY updated_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare("SELECT id, radar_signal_id, side, reason, requested_quantity, filled_quantity, net_usd, status, failure_reason, attempt_count, created_at FROM paper_orders ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM collector_status WHERE source='ave_smart_browser'").first<Record<string, unknown>>(),
    db.prepare("SELECT endpoint,COUNT(*) calls,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures,MAX(captured_at) last_at FROM external_api_usage WHERE provider='gmgn' AND captured_at>=datetime('now','-24 hours') GROUP BY endpoint ORDER BY calls DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT outcome_group,COUNT(*) count FROM narrative_samples GROUP BY outcome_group").all<{ outcome_group: string; count: number }>(),
    db.prepare("SELECT COUNT(*) count FROM narrative_manual_cases").first<{ count: number }>(),
    db.prepare("SELECT version,status,created_at,published_at FROM prompt_rule_versions ORDER BY id DESC LIMIT 10").all<{ version: string; status: string; created_at: string; published_at: string | null }>(),
  ]);
  const learning = emptyLearningSummary();
  for (const row of sampleGroups.results) {
    if (["A", "B", "C", "D", "UNKNOWN"].includes(row.outcome_group)) learning.groups[row.outcome_group as OutcomeGroup] = Number(row.count || 0);
  }
  learning.sampleCount = Object.values(learning.groups).reduce((sum, count) => sum + count, 0);
  learning.completeSampleCount = learning.sampleCount - learning.groups.UNKNOWN;
  learning.manualCaseCount = Number(manualCases?.count || 0);
  learning.promptVersions = promptVersions.results.map((row) => ({ version: row.version, status: row.status as PromptState, createdAt: row.created_at, publishedAt: row.published_at }));
  const totalCandidates = Number(totals?.total || 0);
  return { rows: radar.results.map(mapRadar), totalCandidates, candidates24h: Number(totals?.recent || 0), nextOffset: offset + limit < totalCandidates ? offset + limit : null, paperOrders: orders.results, positions: positions.results, learning, usingFallback: false, aveSmartStatus: collectorDisplayState(collector, Date.parse(now)), aveSmartLastHeartbeatAt: collector?.last_heartbeat_at ? String(collector.last_heartbeat_at) : null, aveCollector: collector || null, gmgnApiHealth: gmgnHealth.results.map((row) => ({ endpoint: String(row.endpoint), calls: Number(row.calls || 0), successes: Number(row.successes || 0), failures: Number(row.failures || 0), lastAt: row.last_at ? String(row.last_at) : null })), gmgnTianyanStatus: "GMGN_TIAN_YAN_BLOCKED", fetchedAt: now };
}
