export const RADAR_DECISIONS = ["APPROVE", "HOLD", "REJECT", "EMERGENCY_CLOSE"] as const;
export type RadarDecision = typeof RADAR_DECISIONS[number];
export type RadarChain = "sol" | "bsc" | "base" | "robinhood";
export const NARRATIVE_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "RETRYING", "FAILED", "INSUFFICIENT_EVIDENCE", "NOT_CONFIGURED"] as const;
export type NarrativeStatus = typeof NARRATIVE_STATUSES[number];
export type CheckState = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type TradeEligibilityStatus = "PASS" | "FAIL" | "UNKNOWN";
export type NarrativeEvidence = {
  source_url: string | null;
  x_post_id: string | null;
  author_handle: string | null;
  author_name: string | null;
  published_at: string | null;
  short_summary: string;
  evidence_relation: "TOKEN_DIRECT" | "PROJECT_OFFICIAL" | "CATALYST_PRIMARY" | "THEME_CONTEXT" | "COMMUNITY_PROPAGATION" | "COUNTER_EVIDENCE" | "LOOKALIKE_OLD_MEME";
  relevance_score: number;
  engagement_metrics: Record<string, number>;
  before_signal_cutoff: boolean;
};
export type NarrativeSearchPlan = {
  narrative_hypothesis: string;
  core_entities: string[];
  event_entities: string[];
  cultural_reference: string | null;
  token_identity_terms: string[];
  primary_query: string;
  fallback_topic_query: string;
  expected_evidence_types: string[];
  ambiguity_warning: string | null;
};
export type XaiUsageEvent = {
  request_id: string;
  response_id: string | null;
  task_type: "RADAR_NARRATIVE_PLAN" | "RADAR_NARRATIVE_SEARCH" | "JSON_REPAIR" | "RADAR_BACKFILL" | "KOL_STAGE_6" | "KOL_STAGE_38" | "NARRATIVE_LEARNING" | "MANUAL_ANALYSIS";
  entry_point: string;
  attempt: number;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  x_search_calls: number | null;
  x_posts_fetched: number | null;
  x_users_fetched: number | null;
  cost_in_usd_ticks: number | null;
  fetch_status: "NOT_APPLICABLE" | "NORMAL" | "ACCEPTABLE" | "FETCH_WARNING" | "EXCESSIVE_X_FETCH" | "UNKNOWN";
};
export type TradeCheck = { key: string; label: string; state: CheckState; reason: string };
export type TradeEligibility = {
  status: TradeEligibilityStatus;
  identityStatus: "VERIFIED" | "PARTIAL_VERIFIED" | "UNVERIFIED" | "FAILED";
  shortReason: string;
  checks: TradeCheck[];
  riskComments: string[];
};

export type RadarCandidate = {
  source: string;
  sourceEventId: string;
  chain: RadarChain;
  tokenAddress: string;
  pairAddress: string | null;
  dexId?: string | null;
  routerId?: string | null;
  launchpadId?: string | null;
  factoryAddress?: string | null;
  sourcePairLabel?: string | null;
  name: string;
  symbol: string;
  firstSeenAt: string;
  poolCreatedAt: string | null;
  price: string | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  holders: number | null;
  buyers: number | null;
  sellers: number | null;
  smartMoneyCount: number;
  dataFetchedAt: string;
  identityVerified: boolean;
  sellSimulationPassed: boolean | null;
  honeypot: boolean | null;
  mintable: boolean | null;
  freezable: boolean | null;
  blacklistable: boolean | null;
  taxModifiable: boolean | null;
  buyTaxBps: number | null;
  sellTaxBps: number | null;
  lpLocked: boolean | null;
  topHolderPct: number | null;
  developerRisk: "known_bad" | "clear" | "unknown";
  priceImpactBps: number | null;
  sourceConflict: boolean;
  sourceProjectDescription?: string | null;
  sourceDescriptionRaw?: string | null;
  sourceDescriptionAt?: string | null;
  sourceDescriptionSource?: string | null;
  knownProjectAccount?: string | null;
  launchpadProgram?: string | null;
  launchpadFactoryVerified?: boolean;
  launchpadPairVerified?: boolean;
  launchpadBuyPath?: boolean;
  launchpadSellPath?: boolean;
  rawSnapshot: Record<string, unknown>;
};

export type RadarAiReview = {
  status: NarrativeStatus;
  decision: RadarDecision;
  confidence: number;
  narrative_score: number | null;
  meme_potential_score: number | null;
  catalyst_evidence_score: number | null;
  risk_score: number | null;
  stage: string;
  summary: string;
  freshness_score: number | null;
  sentiment_score: number | null;
  lead_score: number | null;
  positive_reasons: string[];
  negative_reasons: string[];
  invalidators: string[];
  recommended_action: string;
  model_version: string;
  evidence_refs: string[];
  evidence: NarrativeEvidence[];
  prompt_version: string;
  input_cutoff_at: string;
  analysis_at: string | null;
  attempt_count: number;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_microusd: number | null;
  cost_in_usd_ticks: number | null;
  discovery_plan: NarrativeSearchPlan | null;
  claim_fingerprint: string | null;
  analysis_stage: string;
  x_search_calls: number | null;
  x_posts_fetched: number | null;
  x_users_fetched: number | null;
  fetch_status: XaiUsageEvent["fetch_status"];
  response_id: string | null;
  usage_events: XaiUsageEvent[];
};

export type HardFilterResult = { passed: boolean; status: TradeEligibilityStatus; reasons: string[]; checks: TradeCheck[]; riskComments: string[]; identityStatus: TradeEligibility["identityStatus"] };
export type RadarScore = {
  security: number;
  liquidity: number;
  smartMoney: number;
  growth: number;
  volumeFit: number;
  narrative: number;
  developer: number;
  total: number;
  version: string;
};

export type RadarStrategy = {
  minLiquidityUsd: number;
  maxPriceImpactBps: number;
  maxTaxBps: number;
  maxTopHolderPct: number;
  minBuyers: number;
  minTransactions: number;
  minPoolAgeMs: number;
  maxDataAgeMs: number;
  minSecurityScore: number;
  minNarrativeScore: number;
  minTotalScore: number;
  minAiConfidence: number;
};

export const DEFAULT_RADAR_STRATEGY: RadarStrategy = {
  minLiquidityUsd: 25_000,
  maxPriceImpactBps: 1_000,
  maxTaxBps: 1_500,
  maxTopHolderPct: 25,
  minBuyers: 20,
  minTransactions: 30,
  minPoolAgeMs: 5 * 60_000,
  maxDataAgeMs: 2 * 60_000,
  minSecurityScore: 70,
  minNarrativeScore: 60,
  minTotalScore: 70,
  minAiConfidence: 0.7,
};
