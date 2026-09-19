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
}, (table) => [primaryKey({ columns: [table.source, table.chain] })]);

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
