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
  name: text("name").notNull().default("Unknown"),
  symbol: text("symbol").notNull().default("—"),
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

export const narrativeSamples = sqliteTable("narrative_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }), radarSignalId: integer("radar_signal_id").notNull(), frozenInputJson: text("frozen_input_json").notNull().default("{}"), firstSignalAt: text("first_signal_at").notNull(), outcomeGroup: text("outcome_group").notNull().default("UNKNOWN"), multipleKind: text("multiple_kind").notNull().default("UNVERIFIED_MARKET_MULTIPLE"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_narrative_samples_signal").on(table.radarSignalId)]);

export const promptRuleVersions = sqliteTable("prompt_rule_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }), version: text("version").notNull(), status: text("status").notNull().default("draft"), rulesJson: text("rules_json").notNull().default("[]"), evidenceJson: text("evidence_json").notNull().default("[]"), metricsJson: text("metrics_json").notNull().default("{}"), parentVersion: text("parent_version"), createdBy: text("created_by"), createdAt: text("created_at").notNull(), publishedAt: text("published_at"), rollbackReason: text("rollback_reason"),
}, (table) => [uniqueIndex("uidx_prompt_rule_versions_version").on(table.version), index("idx_prompt_rule_versions_status").on(table.status)]);

export const narrativeManualCases = sqliteTable("narrative_manual_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }), chain: text("chain").notNull(), tokenAddress: text("token_address").notNull(), narrative: text("narrative").notNull(), labelsJson: text("labels_json").notNull().default("[]"), verdict: text("verdict").notNull(), reason: text("reason").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_narrative_manual_cases_token").on(table.chain, table.tokenAddress)]);
