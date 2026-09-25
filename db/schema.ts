import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  chain: text("chain").notNull(),
  walletAddress: text("wallet_address").notNull(),
  walletName: text("wallet_name").notNull(),
  tokenAddress: text("token_address").notNull(),
  side: text("side").notNull(),
  amountUsd: integer("amount_usd"),
  tokenAmount: text("token_amount"),
  tradedAt: text("traded_at").notNull(),
  rawJson: text("raw_json").notNull(),
}, (table) => [index("idx_trades_token_time").on(table.chain, table.tokenAddress, table.tradedAt)]);

export const tokenWallets = sqliteTable("token_wallets", {
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  walletAddress: text("wallet_address").notNull(),
  walletName: text("wallet_name").notNull(),
  firstBuyAt: text("first_buy_at").notNull(),
  lastBuyAt: text("last_buy_at").notNull(),
  buyUsd: integer("buy_usd").notNull().default(0),
  balance: real("balance").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.chain, table.tokenAddress, table.walletAddress] }),
  index("idx_token_wallets_token").on(table.chain, table.tokenAddress),
]);

export const signals = sqliteTable("signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  name: text("name").notNull().default("Unknown"),
  symbol: text("symbol").notNull().default("—"),
  logo: text("logo"),
  threshold: integer("threshold").notNull(),
  holderCount: integer("holder_count").notNull(),
  marketCap: integer("market_cap").notNull().default(0),
  liquidity: integer("liquidity").notNull().default(0),
  holders: integer("holders").notNull().default(0),
  volume24h: integer("volume_24h").notNull().default(0),
  price: text("price").notNull().default("0"),
  gmgnTheme: text("gmgn_theme").notNull().default("暂无"),
  officialDescription: text("official_description").notNull().default(""),
  descriptionSource: text("description_source"),
  descriptionUpdatedAt: text("description_updated_at"),
  website: text("website"),
  socialsJson: text("socials_json").notNull().default("{}"),
  aiAnalysis: text("ai_analysis").notNull().default("等待有效社媒讨论"),
  walletNamesJson: text("wallet_names_json").notNull().default("[]"),
  alertedAt: text("alerted_at").notNull(),
  alertStatus: text("alert_status").notNull().default("sent"),
  alertAttempts: integer("alert_attempts").notNull().default(0),
  alertError: text("alert_error"),
  alertLastAttemptAt: text("alert_last_attempt_at"),
  alertNextAttemptAt: text("alert_next_attempt_at"),
  alertSentAt: text("alert_sent_at"),
  alertPayloadJson: text("alert_payload_json").notNull().default(""),
  signalOrigin: text("signal_origin").notNull().default("kol_monitor"),
  radarSignalId: integer("radar_signal_id"),
  radarScore: integer("radar_score"),
}, (table) => [
  uniqueIndex("uidx_signals_token_threshold").on(table.chain, table.tokenAddress, table.threshold),
  index("idx_signals_alerted_at").on(table.alertedAt),
]);

export const hotPosts = sqliteTable("hot_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull(),
  rank: integer("rank").notNull(),
  author: text("author").notNull(),
  postedAt: text("posted_at"),
  url: text("url").notNull(),
  original: text("original").notNull(),
  chinese: text("chinese").notNull(),
  engagement: text("engagement"),
}, (table) => [index("idx_hot_posts_signal").on(table.signalId)]);

export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  holderCount: integer("holder_count").notNull(),
  totalBuyUsd: integer("total_buy_usd").notNull(),
  totalTokenAmount: real("total_token_amount").notNull().default(0),
  marketValue: real("market_value").notNull(),
  positionDelta: real("position_delta").notNull().default(0),
  coverageRatio: real("coverage_ratio"),
  missingReason: text("missing_reason"),
  capturedAt: text("captured_at").notNull(),
}, (table) => [index("idx_snapshots_token_time").on(table.chain, table.tokenAddress, table.capturedAt)]);

export const monitorRuns = sqliteTable("monitor_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull(),
  newTrades: integer("new_trades").notNull().default(0),
  newSignals: integer("new_signals").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  chain: text("chain").notNull().default(""),
  fetchedRows: integer("fetched_rows").notNull().default(0),
  matchedRows: integer("matched_rows").notNull().default(0),
  feedErrorsJson: text("feed_errors_json").notNull().default("[]"),
  dataReviewCount: integer("data_review_count").notNull().default(0),
  marketConflictCount: integer("market_conflict_count").notNull().default(0),
});

export const sourceHealth = sqliteTable("source_health", {
  source: text("source").notNull(),
  chain: text("chain").notNull(),
  status: text("status").notNull().default("unknown"),
  lastAttemptAt: text("last_attempt_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastFailureAt: text("last_failure_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastLatencyMs: integer("last_latency_ms").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: text("next_retry_at"),
  impact: text("impact").notNull().default("none"),
}, (table) => [primaryKey({ columns: [table.source, table.chain] })]);

export const collectorStatus = sqliteTable("collector_status", {
  source: text("source").primaryKey(),
  instanceId: text("instance_id").notNull(),
  connectionStatus: text("connection_status").notNull().default("not_started"),
  loginStatus: text("login_status").notNull().default("unknown"),
  websocketStatus: text("websocket_status").notNull().default("unknown"),
  lastHeartbeatAt: text("last_heartbeat_at"),
  lastEventAt: text("last_event_at"),
  lastUploadAt: text("last_upload_at"),
  capturedCount: integer("captured_count").notNull().default(0),
  uploadedCount: integer("uploaded_count").notNull().default(0),
  dedupCount: integer("dedup_count").notNull().default(0),
  uploadFailedCount: integer("upload_failed_count").notNull().default(0),
  parseFailedCount: integer("parse_failed_count").notNull().default(0),
  unsupportedCount: integer("unsupported_count").notNull().default(0),
  invalidCount: integer("invalid_count").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

export const providerSamples = sqliteTable("provider_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  dataKind: text("data_kind").notNull(),
  interval: integer("interval").notNull().default(0),
  bucket: text("bucket").notNull(),
  observationCount: integer("observation_count").notNull().default(1),
  requestCount: integer("request_count").notNull().default(0),
  success: integer("success").notNull().default(0),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms").notNull().default(0),
  cacheHit: integer("cache_hit").notNull().default(0),
  rateLimited: integer("rate_limited").notNull().default(0),
  identityVerified: integer("identity_verified").notNull().default(0),
  availableFieldsJson: text("available_fields_json").notNull().default("[]"),
  sourceTimestamp: text("source_timestamp"),
  capturedAt: text("captured_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_provider_samples_bucket").on(table.source, table.chain, table.tokenAddress, table.dataKind, table.interval, table.bucket),
  index("idx_provider_samples_time").on(table.source, table.capturedAt),
]);

export const marketReviews = sqliteTable("market_reviews", {
  chain: text("chain").notNull(), tokenAddress: text("token_address").notNull(), status: text("status").notNull(), reason: text("reason").notNull(),
  marketCap: real("market_cap"), marketCapSource: text("market_cap_source"), marketDataConflict: integer("market_data_conflict").notNull().default(0),
  sourceValuesJson: text("source_values_json").notNull().default("{}"), holderCount: integer("holder_count"), holderSource: text("holder_source"),
  tokenCreatedAt: text("token_created_at"), identityVerified: integer("identity_verified").notNull().default(0), lastCheckedAt: text("last_checked_at").notNull(),
}, (table) => [primaryKey({ columns: [table.chain, table.tokenAddress] })]);

export const userTrades = sqliteTable("user_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chain: text("chain").notNull(),
  network: text("network").notNull(),
  txHash: text("tx_hash").notNull(),
  walletAddress: text("wallet_address").notNull(),
  sellToken: text("sell_token").notNull(),
  buyToken: text("buy_token").notNull(),
  sellAmount: text("sell_amount").notNull(),
  minimumOut: text("minimum_out").notNull(),
  status: text("status").notNull(),
  approvalTxHash: text("approval_tx_hash"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  confirmedAt: text("confirmed_at"),
}, (table) => [
  uniqueIndex("uidx_user_trades_chain_hash").on(table.chain, table.txHash),
  index("idx_user_trades_wallet_time").on(table.walletAddress, table.createdAt),
]);

export const radarSignals = sqliteTable("radar_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  pairAddress: text("pair_address"),
  dexId: text("dex_id"),
  routerId: text("router_id"),
  launchpadId: text("launchpad_id"),
  factoryAddress: text("factory_address"),
  sourcePairLabel: text("source_pair_label"),
  identityStatus: text("identity_status").notNull().default("UNVERIFIED"),
  name: text("name").notNull().default("Unknown"),
  symbol: text("symbol").notNull().default("—"),
  sourceProjectDescription: text("source_project_description"),
  sourceDescriptionRaw: text("source_description_raw"),
  sourceDescriptionAt: text("source_description_at"),
  sourceDescriptionSource: text("source_description_source"),
  sourceDescriptionFingerprint: text("source_description_fingerprint"),
  status: text("status").notNull().default("new"),
  signalType: text("signal_type").notNull().default("candidate"),
  ruleVersion: text("rule_version").notNull(),
  modelVersion: text("model_version"),
  firstSeenAt: text("first_seen_at").notNull(),
  poolCreatedAt: text("pool_created_at"),
  price: text("price").notNull().default("0"),
  marketCap: real("market_cap"),
  liquidity: real("liquidity"),
  volume24h: real("volume_24h"),
  holders: integer("holders"),
  buyers: integer("buyers"),
  sellers: integer("sellers"),
  smartMoneyCount: integer("smart_money_count").notNull().default(0),
  securityScore: integer("security_score").notNull().default(0),
  narrativeScore: integer("narrative_score").notNull().default(0),
  narrativeScoreV2: integer("narrative_score_v2"),
  narrativeStatus: text("narrative_status").notNull().default("PENDING"),
  narrativeSummary: text("narrative_summary"),
  narrativeUpdatedAt: text("narrative_updated_at"),
  momentumScore: integer("momentum_score").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  aiDecision: text("ai_decision").notNull().default("HOLD"),
  aiConfidence: real("ai_confidence").notNull().default(0),
  aiReason: text("ai_reason").notNull().default("证据不足，继续观察"),
  hardFilterPassed: integer("hard_filter_passed").notNull().default(0),
  rejectReason: text("reject_reason"),
  dataFreshnessMs: integer("data_freshness_ms"),
  sourceStatusJson: text("source_status_json").notNull().default("{}"),
  rawInputJson: text("raw_input_json").notNull().default("{}"),
  discoveredAt: text("discovered_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_radar_signals_chain_token").on(table.chain, table.tokenAddress),
  index("idx_radar_signals_status_time").on(table.status, table.firstSeenAt),
  index("idx_radar_signals_score").on(table.totalScore),
]);

export const radarSignalSources = sqliteTable("radar_signal_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  source: text("source").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  sourceUrl: text("source_url"),
  cursor: text("cursor"),
  observedAt: text("observed_at").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  rawSnapshotJson: text("raw_snapshot_json").notNull().default("{}"),
}, (table) => [
  uniqueIndex("uidx_radar_sources_event").on(table.source, table.sourceEventId),
  index("idx_radar_sources_signal_time").on(table.radarSignalId, table.observedAt),
]);

export const radarIngestEvents = sqliteTable("radar_ingest_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), source: text("source").notNull(), sourceEventId: text("source_event_id").notNull(),
  radarSignalId: integer("radar_signal_id"), chain: text("chain"), tokenAddress: text("token_address"), outcome: text("outcome").notNull(), reason: text("reason"),
  observedAt: text("observed_at").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("uidx_radar_ingest_event").on(table.source, table.sourceEventId), index("idx_radar_ingest_time").on(table.createdAt)]);

export const dexRegistry = sqliteTable("dex_registry", {
  chain: text("chain").notNull(), dexId: text("dex_id").notNull(), poolType: text("pool_type").notNull(), factoryAddress: text("factory_address").notNull(),
  routerAddress: text("router_address").notNull(), quoteTokensJson: text("quote_tokens_json").notNull().default("[]"), status: text("status").notNull().default("VERIFIED"), updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.chain, table.dexId, table.factoryAddress] })]);

export const radarEnrichmentState = sqliteTable("radar_enrichment_state", {
  radarSignalId: integer("radar_signal_id").primaryKey(), status: text("status").notNull().default("PENDING"), tradeDataStage: text("trade_data_stage").notNull().default("CANDIDATE_ONLY"),
  avatarOriginalUrl: text("avatar_original_url"), avatarResolvedUrl: text("avatar_resolved_url"), avatarSource: text("avatar_source"), avatarCheckedAt: text("avatar_checked_at"), avatarStatus: text("avatar_status").notNull().default("PENDING"), avatarErrorCode: text("avatar_error_code"),
  primaryPairAddress: text("primary_pair_address"), poolType: text("pool_type"), dexId: text("dex_id"), factoryAddress: text("factory_address"), routerAddress: text("router_address"), quoteToken: text("quote_token"),
  pairStatus: text("pair_status").notNull().default("PENDING"), pairSource: text("pair_source"), pairCheckedAt: text("pair_checked_at"), pairBlockNumber: integer("pair_block_number"),
  liquidityUsd: real("liquidity_usd"), liquiditySource: text("liquidity_source"), liquidityStatus: text("liquidity_status").notNull().default("PENDING"), liquidityCheckedAt: text("liquidity_checked_at"), dataConflict: integer("data_conflict").notNull().default(0),
  uniqueBuyers24h: integer("unique_buyers_24h"), uniqueSellers24h: integer("unique_sellers_24h"), buyTx24h: integer("buy_tx_24h"), sellTx24h: integer("sell_tx_24h"), activitySource: text("activity_source"), activityStatus: text("activity_status").notNull().default("PENDING"), activityWindowStart: text("activity_window_start"), activityWindowEnd: text("activity_window_end"),
  tokenCreatedAt: text("token_created_at"), tokenCreatedSource: text("token_created_source"), tokenCreatedStatus: text("token_created_status").notNull().default("PENDING"), poolCreatedAt: text("pool_created_at"), poolCreatedSource: text("pool_created_source"), poolCreatedStatus: text("pool_created_status").notNull().default("PENDING"), systemFirstSeenAt: text("system_first_seen_at").notNull(),
  errorCode: text("error_code"), errorReason: text("error_reason"), retryCount: integer("retry_count").notNull().default(0), nextRetryAt: text("next_retry_at"), terminal: integer("terminal").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_radar_enrichment_retry").on(table.status, table.nextRetryAt)]);

export const radarPoolCandidates = sqliteTable("radar_pool_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }), radarSignalId: integer("radar_signal_id").notNull(), pairAddress: text("pair_address").notNull(), poolType: text("pool_type"), dexId: text("dex_id"), factoryAddress: text("factory_address"), routerAddress: text("router_address"), token0: text("token0"), token1: text("token1"), quoteToken: text("quote_token"), feeTier: integer("fee_tier"), liquidityUsd: real("liquidity_usd"), liquiditySource: text("liquidity_source"), source: text("source").notNull(), status: text("status").notNull(), blockNumber: integer("block_number"), checkedAt: text("checked_at").notNull(), errorCode: text("error_code"), errorReason: text("error_reason"),
}, (table) => [uniqueIndex("uidx_radar_pool_candidate").on(table.radarSignalId, table.pairAddress), index("idx_radar_pool_signal").on(table.radarSignalId)]);

export const radarReadonlyQuotes = sqliteTable("radar_readonly_quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }), radarSignalId: integer("radar_signal_id").notNull(), amountUsd: integer("amount_usd").notNull(), buyAmountOut: text("buy_amount_out"), sellAmountOutUsd: text("sell_amount_out_usd"), priceImpactBps: integer("price_impact_bps"), roundTripLossBps: integer("round_trip_loss_bps"), status: text("status").notNull(), errorCode: text("error_code"), quotedAt: text("quoted_at").notNull(), blockNumber: integer("block_number"),
}, (table) => [uniqueIndex("uidx_radar_quote_band").on(table.radarSignalId, table.amountUsd)]);

export const radarSignalSnapshots = sqliteTable("radar_signal_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  price: text("price"),
  executableBuyPrice: text("executable_buy_price"),
  executableSellPrice: text("executable_sell_price"),
  marketCap: real("market_cap"),
  liquidity: real("liquidity"),
  volume24h: real("volume_24h"),
  holders: integer("holders"),
  buyers: integer("buyers"),
  sellers: integer("sellers"),
  sourceStatusJson: text("source_status_json").notNull().default("{}"),
  capturedAt: text("captured_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_radar_snapshots_signal_time").on(table.radarSignalId, table.capturedAt),
  index("idx_radar_snapshots_signal_time").on(table.radarSignalId, table.capturedAt),
]);

export const radarAnalysis = sqliteTable("radar_analysis", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  modelVersion: text("model_version").notNull(),
  decision: text("decision").notNull(),
  confidence: real("confidence").notNull().default(0),
  narrativeScore: integer("narrative_score").notNull().default(0),
  riskScore: integer("risk_score").notNull().default(100),
  stage: text("stage").notNull().default("unknown"),
  positiveReasonsJson: text("positive_reasons_json").notNull().default("[]"),
  negativeReasonsJson: text("negative_reasons_json").notNull().default("[]"),
  invalidatorsJson: text("invalidators_json").notNull().default("[]"),
  recommendedAction: text("recommended_action").notNull().default("HOLD"),
  evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
  inputSummaryJson: text("input_summary_json").notNull().default("{}"),
  outputJson: text("output_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_radar_analysis_signal_time").on(table.radarSignalId, table.createdAt)]);

export const radarNarrativeAnalysis = sqliteTable("radar_narrative_analysis", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  taskId: text("task_id").notNull(),
  status: text("status").notNull().default("PENDING"),
  promptVersion: text("prompt_version").notNull(),
  modelVersion: text("model_version").notNull(),
  decision: text("decision").notNull().default("HOLD"),
  score: integer("score"),
  memePotentialScore: integer("meme_potential_score"),
  catalystEvidenceScore: integer("catalyst_evidence_score"),
  riskScore: integer("risk_score"),
  freshnessScore: integer("freshness_score"),
  sentimentScore: integer("sentiment_score"),
  leadScore: integer("lead_score"),
  stage: text("stage").notNull().default("unknown"),
  confidence: real("confidence"),
  summary: text("summary").notNull().default(""),
  positiveReasonsJson: text("positive_reasons_json").notNull().default("[]"),
  negativeReasonsJson: text("negative_reasons_json").notNull().default("[]"),
  invalidatorsJson: text("invalidators_json").notNull().default("[]"),
  recommendedAction: text("recommended_action").notNull().default("HOLD"),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  evidenceCount: integer("evidence_count").notNull().default(0),
  inputSummaryJson: text("input_summary_json").notNull().default("{}"),
  inputCutoffAt: text("input_cutoff_at").notNull(),
  analysisAt: text("analysis_at"),
  attemptCount: integer("attempt_count").notNull().default(0),
  errorCode: text("error_code"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costMicrousd: integer("cost_microusd"),
  costInUsdTicks: integer("cost_in_usd_ticks"),
  searchPlanJson: text("search_plan_json").notNull().default("{}"),
  claimFingerprint: text("claim_fingerprint"),
  analysisStage: text("analysis_stage").notNull().default("NARRATIVE_DISCOVERY"),
  xSearchCalls: integer("x_search_calls"),
  xPostsFetched: integer("x_posts_fetched"),
  xUsersFetched: integer("x_users_fetched"),
  fetchStatus: text("fetch_status").notNull().default("UNKNOWN"),
  responseId: text("response_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_radar_narrative_task").on(table.taskId),
  index("idx_radar_narrative_signal_time").on(table.radarSignalId, table.updatedAt),
]);

export const radarTradeEligibility = sqliteTable("radar_trade_eligibility", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  status: text("status").notNull().default("UNKNOWN"),
  identityStatus: text("identity_status").notNull().default("UNVERIFIED"),
  shortReason: text("short_reason").notNull().default("交易条件待补全"),
  checksJson: text("checks_json").notNull().default("[]"),
  riskCommentsJson: text("risk_comments_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_radar_trade_signal").on(table.radarSignalId)]);

export const narrativeEvents = sqliteTable("narrative_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  author: text("author"),
  evidenceJson: text("evidence_json").notNull().default("{}"),
  occurredAt: text("occurred_at"),
  capturedAt: text("captured_at").notNull(),
}, (table) => [index("idx_narrative_events_signal_time").on(table.radarSignalId, table.capturedAt)]);

export const strategySettings = sqliteTable("strategy_settings", {
  userId: text("user_id").primaryKey(),
  version: text("version").notNull().default("radar-paper-v1"),
  buyAmountUsd: text("buy_amount_usd").notNull().default("25"),
  maxPerTokenUsd: text("max_per_token_usd").notNull().default("50"),
  maxOpenPositions: integer("max_open_positions").notNull().default(5),
  maxDailyBuys: integer("max_daily_buys").notNull().default(5),
  maxDailyLossUsd: text("max_daily_loss_usd").notNull().default("50"),
  minSecurityScore: integer("min_security_score").notNull().default(70),
  minNarrativeScore: integer("min_narrative_score").notNull().default(60),
  minTotalScore: integer("min_total_score").notNull().default(70),
  minAiConfidence: real("min_ai_confidence").notNull().default(0.7),
  maxSlippageBps: integer("max_slippage_bps").notNull().default(300),
  maxPriceImpactBps: integer("max_price_impact_bps").notNull().default(1000),
  allowedChainsJson: text("allowed_chains_json").notNull().default("[\"sol\",\"bsc\",\"base\",\"robinhood\"]"),
  autoTradeEnabled: integer("auto_trade_enabled").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const paperPositions = sqliteTable("paper_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  radarSignalId: integer("radar_signal_id").notNull(),
  chain: text("chain").notNull(),
  tokenAddress: text("token_address").notNull(),
  status: text("status").notNull().default("open"),
  entryQuantity: text("entry_quantity").notNull(),
  remainingQuantity: text("remaining_quantity").notNull(),
  netCostUsd: text("net_cost_usd").notNull(),
  realizedUsd: text("realized_usd").notNull().default("0"),
  peakExecutableValueUsd: text("peak_executable_value_usd").notNull().default("0"),
  currentExecutableValueUsd: text("current_executable_value_usd").notNull().default("0"),
  nextTakeProfitMultiple: integer("next_take_profit_multiple").notNull().default(2),
  takeProfitCount: integer("take_profit_count").notNull().default(0),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_paper_positions_user_signal").on(table.userId, table.radarSignalId),
  index("idx_paper_positions_user_status").on(table.userId, table.status),
]);

export const paperOrders = sqliteTable("paper_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  idempotencyKey: text("idempotency_key").notNull(),
  positionId: integer("position_id"),
  radarSignalId: integer("radar_signal_id").notNull(),
  userId: text("user_id").notNull(),
  side: text("side").notNull(),
  reason: text("reason").notNull(),
  requestedQuantity: text("requested_quantity").notNull(),
  filledQuantity: text("filled_quantity").notNull().default("0"),
  executablePrice: text("executable_price"),
  grossUsd: text("gross_usd"),
  feesUsd: text("fees_usd"),
  netUsd: text("net_usd"),
  status: text("status").notNull().default("pending"),
  failureReason: text("failure_reason"),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_paper_orders_idempotency").on(table.idempotencyKey),
  index("idx_paper_orders_user_time").on(table.userId, table.createdAt),
]);

export const positionEvents = sqliteTable("position_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  positionId: integer("position_id").notNull(),
  eventKey: text("event_key").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_position_events_key").on(table.positionId, table.eventKey),
  index("idx_position_events_time").on(table.positionId, table.createdAt),
]);

export const exitLadders = sqliteTable("exit_ladders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  positionId: integer("position_id").notNull(),
  multiple: integer("multiple").notNull(),
  sellRemainingBps: integer("sell_remaining_bps").notNull().default(5000),
  status: text("status").notNull().default("pending"),
  triggeredAt: text("triggered_at"),
  completedAt: text("completed_at"),
}, (table) => [uniqueIndex("uidx_exit_ladders_position_multiple").on(table.positionId, table.multiple)]);

export const executionAttempts = sqliteTable("execution_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode").notNull().default("paper"),
  orderId: integer("order_id"),
  action: text("action").notNull(),
  state: text("state").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  requestSummaryJson: text("request_summary_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_execution_attempts_order").on(table.orderId, table.createdAt)]);

export const tradeOutcomes = sqliteTable("trade_outcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarSignalId: integer("radar_signal_id").notNull(),
  horizon: text("horizon").notNull(),
  observedAt: text("observed_at").notNull(),
  netReturnBps: integer("net_return_bps"),
  maxUpsideBps: integer("max_upside_bps"),
  maxDrawdownBps: integer("max_drawdown_bps"),
  sellable: integer("sellable"),
  liquidityRemoved: integer("liquidity_removed").notNull().default(0),
  zeroed: integer("zeroed").notNull().default(0),
  paperResultJson: text("paper_result_json").notNull().default("{}"),
  dataFreshnessMs: integer("data_freshness_ms"),
  marketPrice: text("market_price"), marketCap: real("market_cap"), liquidity: real("liquidity"), holders: integer("holders"), quoteStatus: text("quote_status").notNull().default("NOT_QUOTED"), source: text("source"), sourceTimestamp: text("source_timestamp"), multipleKind: text("multiple_kind").notNull().default("UNVERIFIED_MARKET_MULTIPLE"),
}, (table) => [uniqueIndex("uidx_trade_outcomes_signal_horizon").on(table.radarSignalId, table.horizon)]);

export const userWalletAccounts = sqliteTable("user_wallet_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  namespace: text("namespace").notNull(),
  chain: text("chain").notNull(),
  walletAddress: text("wallet_address").notNull(),
  verifiedAt: text("verified_at").notNull(),
  lastLoginAt: text("last_login_at"),
}, (table) => [uniqueIndex("uidx_wallet_accounts_identity").on(table.namespace, table.chain, table.walletAddress)]);

export const userTradingWallets = sqliteTable("user_trading_wallets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  namespace: text("namespace").notNull(),
  publicAddress: text("public_address"),
  custodyProvider: text("custody_provider").notNull().default("NOT_PROVISIONED"),
  keyReference: text("key_reference"),
  status: text("status").notNull().default("disabled"),
  withdrawalAllowlistJson: text("withdrawal_allowlist_json").notNull().default("[]"),
  dailyLimitUsd: text("daily_limit_usd").notNull().default("0"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_trading_wallets_user_namespace").on(table.userId, table.namespace)]);

export const walletAuthNonces = sqliteTable("wallet_auth_nonces", {
  nonceHash: text("nonce_hash").primaryKey(),
  namespace: text("namespace").notNull(),
  chain: text("chain").notNull(),
  walletAddress: text("wallet_address").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_wallet_auth_nonces_expiry").on(table.expiresAt)]);

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by"),
});

export const apiUsageMetrics = sqliteTable("api_usage_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }), kind: text("kind").notNull(), source: text("source").notNull(), requestCount: integer("request_count").notNull().default(0), cacheHits: integer("cache_hits").notNull().default(0), filteredSaved: integer("filtered_saved").notNull().default(0), lastKnownGoodUses: integer("last_known_good_uses").notNull().default(0), capturedAt: text("captured_at").notNull(),
}, (table) => [index("idx_api_usage_metrics_time").on(table.kind, table.capturedAt)]);

export const externalApiCache = sqliteTable("external_api_cache", {
  cacheKey: text("cache_key").primaryKey(), provider: text("provider").notNull(), endpoint: text("endpoint").notNull(), chain: text("chain").notNull().default(""), tokenAddress: text("token_address").notNull().default(""), payloadJson: text("payload_json"), negative: integer("negative").notNull().default(0), expiresAt: text("expires_at").notNull(), staleUntil: text("stale_until").notNull(), lockOwner: text("lock_owner"), lockUntil: text("lock_until"), lookupCount: integer("lookup_count").notNull().default(0), hitCount: integer("hit_count").notNull().default(0), negativeHitCount: integer("negative_hit_count").notNull().default(0), coalescedCount: integer("coalesced_count").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_external_api_cache_expiry").on(table.provider, table.expiresAt), index("idx_external_api_cache_token").on(table.chain, table.tokenAddress)]);

export const externalApiUsage = sqliteTable("external_api_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }), requestId: text("request_id").notNull(), provider: text("provider").notNull(), tier: text("tier").notNull(), endpoint: text("endpoint").notNull(), task: text("task").notNull(), chain: text("chain").notNull().default(""), tokenCount: integer("token_count").notNull().default(1), status: text("status").notNull(), httpStatus: integer("http_status"), latencyMs: integer("latency_ms").notNull().default(0), retryNumber: integer("retry_number").notNull().default(0), rateLimited: integer("rate_limited").notNull().default(0), capturedAt: text("captured_at").notNull(),
}, (table) => [uniqueIndex("uidx_external_api_usage_request").on(table.requestId), index("idx_external_api_usage_budget").on(table.provider, table.tier, table.capturedAt), index("idx_external_api_usage_endpoint").on(table.endpoint, table.capturedAt)]);

export const narrativeSamples = sqliteTable("narrative_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }), radarSignalId: integer("radar_signal_id").notNull(), frozenInputJson: text("frozen_input_json").notNull().default("{}"), firstSignalAt: text("first_signal_at").notNull(), outcomeGroup: text("outcome_group").notNull().default("UNKNOWN"), multipleKind: text("multiple_kind").notNull().default("UNVERIFIED_MARKET_MULTIPLE"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_narrative_samples_signal").on(table.radarSignalId)]);

export const promptRuleVersions = sqliteTable("prompt_rule_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }), version: text("version").notNull(), status: text("status").notNull().default("draft"), rulesJson: text("rules_json").notNull().default("[]"), evidenceJson: text("evidence_json").notNull().default("[]"), metricsJson: text("metrics_json").notNull().default("{}"), parentVersion: text("parent_version"), createdBy: text("created_by"), createdAt: text("created_at").notNull(), publishedAt: text("published_at"), rollbackReason: text("rollback_reason"),
}, (table) => [uniqueIndex("uidx_prompt_rule_versions_version").on(table.version), index("idx_prompt_rule_versions_status").on(table.status)]);

export const narrativeManualCases = sqliteTable("narrative_manual_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }), chain: text("chain").notNull(), tokenAddress: text("token_address").notNull(), narrative: text("narrative").notNull(), labelsJson: text("labels_json").notNull().default("[]"), verdict: text("verdict").notNull(), reason: text("reason").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_narrative_manual_cases_token").on(table.chain, table.tokenAddress)]);

export const xaiRequestUsage = sqliteTable("xai_request_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").notNull(),
  responseId: text("response_id"),
  radarSignalId: integer("radar_signal_id"),
  candidateId: text("candidate_id"),
  chain: text("chain").notNull().default(""),
  tokenAddress: text("token_address").notNull().default(""),
  taskType: text("task_type").notNull(),
  entryPoint: text("entry_point").notNull(),
  claimFingerprint: text("claim_fingerprint"),
  attempt: integer("attempt").notNull().default(1),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  xSearchCalls: integer("x_search_calls"),
  xPostsFetched: integer("x_posts_fetched"),
  xUsersFetched: integer("x_users_fetched"),
  costInUsdTicks: integer("cost_in_usd_ticks"),
  fetchStatus: text("fetch_status").notNull().default("UNKNOWN"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_xai_request_usage_request").on(table.requestId),
  index("idx_xai_request_usage_task_time").on(table.taskType, table.createdAt),
  index("idx_xai_request_usage_fetch_time").on(table.fetchStatus, table.createdAt),
]);

// Exchange intelligence and large-fund-flow monitoring are deliberately isolated
// from KOL/radar admission data. They have their own identities, cursors, health
// rows and delivery queues.
export const exchangeEvents = sqliteTable("exchange_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventKey: text("event_key").notNull(), exchange: text("exchange").notNull(), eventType: text("event_type").notNull(), marketType: text("market_type").notNull().default("unknown"), title: text("title").notNull(), titleZh: text("title_zh"), translationStatus: text("translation_status").notNull().default("pending"), translationProvider: text("translation_provider"), translationSourceHash: text("translation_source_hash"), translationError: text("translation_error"), translatedAt: text("translated_at"), translationCharCount: integer("translation_char_count").notNull().default(0), assetsJson: text("assets_json").notNull().default("[]"), pairsJson: text("pairs_json").notNull().default("[]"), conditions: text("conditions"), announcementId: text("announcement_id"), sourceName: text("source_name").notNull(), sourceUrl: text("source_url").notNull(), sourceKind: text("source_kind").notNull(), announcementAt: text("announcement_at"), discoveredAt: text("discovered_at").notNull(), expectedEffectiveAt: text("expected_effective_at"), actualEffectiveAt: text("actual_effective_at"), activityStartAt: text("activity_start_at"), activityEndAt: text("activity_end_at"), status: text("status").notNull().default("announced"), priority: text("priority").notNull().default("normal"), contentHash: text("content_hash").notNull(), revision: integer("revision").notNull().default(1), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_exchange_events_key").on(table.eventKey), index("idx_exchange_events_time").on(table.discoveredAt), index("idx_exchange_events_filter").on(table.exchange, table.eventType, table.marketType, table.status)]);

export const exchangeEventRevisions = sqliteTable("exchange_event_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventId: integer("event_id").notNull(), revision: integer("revision").notNull(), contentHash: text("content_hash").notNull(), payloadJson: text("payload_json").notNull(), recordedAt: text("recorded_at").notNull(),
}, (table) => [uniqueIndex("uidx_exchange_revision").on(table.eventId, table.revision)]);

export const exchangePairSnapshots = sqliteTable("exchange_pair_snapshots", {
  exchange: text("exchange").notNull(), marketType: text("market_type").notNull(), pairsJson: text("pairs_json").notNull(), contentHash: text("content_hash").notNull(), initializedAt: text("initialized_at").notNull(), capturedAt: text("captured_at").notNull(), sourceUrl: text("source_url").notNull(),
}, (table) => [primaryKey({ columns: [table.exchange, table.marketType] })]);

export const exchangeCollectorState = sqliteTable("exchange_collector_state", {
  source: text("source").primaryKey(), exchange: text("exchange").notNull(), status: text("status").notNull(), cursor: text("cursor"), lastAttemptAt: text("last_attempt_at").notNull(), lastSuccessAt: text("last_success_at"), lastEventAt: text("last_event_at"), lastLatencyMs: integer("last_latency_ms").notNull().default(0), consecutiveFailures: integer("consecutive_failures").notNull().default(0), nextRetryAt: text("next_retry_at"), lastError: text("last_error"), coverageJson: text("coverage_json").notNull().default("[]"),
});

export const exchangeAlertDeliveries = sqliteTable("exchange_alert_deliveries", {
  eventId: integer("event_id").primaryKey(), deliveryKey: text("delivery_key").notNull(), status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), nextAttemptAt: text("next_attempt_at"), lastAttemptAt: text("last_attempt_at"), sentAt: text("sent_at"), lastError: text("last_error"), payloadHash: text("payload_hash").notNull(),
}, (table) => [uniqueIndex("uidx_exchange_delivery_key").on(table.deliveryKey)]);

export const fundFlowEvents = sqliteTable("fund_flow_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventKey: text("event_key").notNull(), provider: text("provider").notNull(), chain: text("chain").notNull(), symbol: text("symbol").notNull(), tokenContract: text("token_contract"), rawAmount: text("raw_amount"), amount: text("amount").notNull(), amountUsd: real("amount_usd"), priceUsd: real("price_usd"), priceAt: text("price_at"), priceSource: text("price_source"), valuationMethod: text("valuation_method"), valuationStatus: text("valuation_status").notNull().default("verified"), txHash: text("tx_hash").notNull(), sourceUrl: text("source_url"), attributionUrl: text("attribution_url"), fromAddress: text("from_address").notNull(), toAddress: text("to_address").notNull(), fromEntity: text("from_entity"), toEntity: text("to_entity"), fromLabelSource: text("from_label_source"), toLabelSource: text("to_label_source"), labelConfidence: text("label_confidence").notNull().default("unverified"), direction: text("direction").notNull(), classification: text("classification").notNull(), countsTowardNetflow: integer("counts_toward_netflow").notNull().default(0), institutionTradeSide: text("institution_trade_side"), bridgeName: text("bridge_name"), chainOccurredAt: text("chain_occurred_at").notNull(), discoveredAt: text("discovered_at").notNull(), rawFingerprint: text("raw_fingerprint").notNull(),
}, (table) => [uniqueIndex("uidx_fund_flow_event_key").on(table.eventKey), index("idx_fund_flow_time").on(table.chainOccurredAt), index("idx_fund_flow_rollup").on(table.symbol, table.chain, table.direction, table.chainOccurredAt)]);

export const stablecoinMintEvents = sqliteTable("stablecoin_mint_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventKey: text("event_key").notNull(), provider: text("provider").notNull(), chain: text("chain").notNull(), symbol: text("symbol").notNull(), tokenContract: text("token_contract").notNull(), rawAmount: text("raw_amount").notNull(), amount: text("amount").notNull(), amountUsd: real("amount_usd").notNull(), txHash: text("tx_hash").notNull(), logIndex: integer("log_index").notNull(), issuer: text("issuer").notNull(), recipientAddress: text("recipient_address"), evidenceType: text("evidence_type").notNull(), issuanceClassification: text("issuance_classification").notNull(), sourceUrl: text("source_url").notNull(), contractEvidenceUrl: text("contract_evidence_url").notNull(), chainOccurredAt: text("chain_occurred_at").notNull(), discoveredAt: text("discovered_at").notNull(),
}, (table) => [uniqueIndex("uidx_stablecoin_mint_event_key").on(table.eventKey), index("idx_stablecoin_mint_time").on(table.chainOccurredAt), index("idx_stablecoin_mint_symbol_time").on(table.symbol, table.chainOccurredAt)]);

export const fundFlowCollectorState = sqliteTable("fund_flow_collector_state", {
  source: text("source").primaryKey(), status: text("status").notNull(), cursor: text("cursor"), connectionStatus: text("connection_status").notNull().default("not_started"), lastAttemptAt: text("last_attempt_at").notNull(), lastSuccessAt: text("last_success_at"), lastEventAt: text("last_event_at"), lastHeartbeatAt: text("last_heartbeat_at"), consecutiveFailures: integer("consecutive_failures").notNull().default(0), nextRetryAt: text("next_retry_at"), lastLatencyMs: integer("last_latency_ms").notNull().default(0), lastError: text("last_error"), coverageJson: text("coverage_json").notNull().default("[]"),
});

export const fundFlowAlertDeliveries = sqliteTable("fund_flow_alert_deliveries", {
  eventId: integer("event_id").primaryKey(), deliveryKey: text("delivery_key").notNull(), status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), nextAttemptAt: text("next_attempt_at"), lastAttemptAt: text("last_attempt_at"), sentAt: text("sent_at"), lastError: text("last_error"), payloadHash: text("payload_hash").notNull(),
}, (table) => [uniqueIndex("uidx_fund_flow_delivery_key").on(table.deliveryKey)]);
