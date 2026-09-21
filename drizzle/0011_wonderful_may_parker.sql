CREATE TABLE `execution_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text DEFAULT 'paper' NOT NULL,
	`order_id` integer,
	`action` text NOT NULL,
	`state` text NOT NULL,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`error_code` text,
	`error_message` text,
	`request_summary_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_execution_attempts_order` ON `execution_attempts` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `exit_ladders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`multiple` integer NOT NULL,
	`sell_remaining_bps` integer DEFAULT 5000 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`triggered_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_exit_ladders_position_multiple` ON `exit_ladders` (`position_id`,`multiple`);--> statement-breakpoint
CREATE TABLE `narrative_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`author` text,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_narrative_events_signal_time` ON `narrative_events` (`radar_signal_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `paper_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`position_id` integer,
	`radar_signal_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`side` text NOT NULL,
	`reason` text NOT NULL,
	`requested_quantity` text NOT NULL,
	`filled_quantity` text DEFAULT '0' NOT NULL,
	`executable_price` text,
	`gross_usd` text,
	`fees_usd` text,
	`net_usd` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`failure_reason` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_paper_orders_idempotency` ON `paper_orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_paper_orders_user_time` ON `paper_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `paper_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`entry_quantity` text NOT NULL,
	`remaining_quantity` text NOT NULL,
	`net_cost_usd` text NOT NULL,
	`realized_usd` text DEFAULT '0' NOT NULL,
	`peak_executable_value_usd` text DEFAULT '0' NOT NULL,
	`current_executable_value_usd` text DEFAULT '0' NOT NULL,
	`next_take_profit_multiple` integer DEFAULT 2 NOT NULL,
	`take_profit_count` integer DEFAULT 0 NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_paper_positions_user_signal` ON `paper_positions` (`user_id`,`radar_signal_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_positions_user_status` ON `paper_positions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `position_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`event_key` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_position_events_key` ON `position_events` (`position_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `idx_position_events_time` ON `position_events` (`position_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `radar_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`model_version` text NOT NULL,
	`decision` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`narrative_score` integer DEFAULT 0 NOT NULL,
	`risk_score` integer DEFAULT 100 NOT NULL,
	`stage` text DEFAULT 'unknown' NOT NULL,
	`positive_reasons_json` text DEFAULT '[]' NOT NULL,
	`negative_reasons_json` text DEFAULT '[]' NOT NULL,
	`invalidators_json` text DEFAULT '[]' NOT NULL,
	`recommended_action` text DEFAULT 'HOLD' NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`input_summary_json` text DEFAULT '{}' NOT NULL,
	`output_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_radar_analysis_signal_time` ON `radar_analysis` (`radar_signal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `radar_signal_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`price` text,
	`executable_buy_price` text,
	`executable_sell_price` text,
	`market_cap` real,
	`liquidity` real,
	`volume_24h` real,
	`holders` integer,
	`buyers` integer,
	`sellers` integer,
	`source_status_json` text DEFAULT '{}' NOT NULL,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_snapshots_signal_time` ON `radar_signal_snapshots` (`radar_signal_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_radar_snapshots_signal_time` ON `radar_signal_snapshots` (`radar_signal_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `radar_signal_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`source` text NOT NULL,
	`source_event_id` text NOT NULL,
	`source_url` text,
	`cursor` text,
	`observed_at` text NOT NULL,
	`fetched_at` text NOT NULL,
	`raw_snapshot_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_sources_event` ON `radar_signal_sources` (`source`,`source_event_id`);--> statement-breakpoint
CREATE INDEX `idx_radar_sources_signal_time` ON `radar_signal_sources` (`radar_signal_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `radar_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`pair_address` text,
	`name` text DEFAULT 'Unknown' NOT NULL,
	`symbol` text DEFAULT '—' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`signal_type` text DEFAULT 'candidate' NOT NULL,
	`rule_version` text NOT NULL,
	`model_version` text,
	`first_seen_at` text NOT NULL,
	`pool_created_at` text,
	`price` text DEFAULT '0' NOT NULL,
	`market_cap` real,
	`liquidity` real,
	`volume_24h` real,
	`holders` integer,
	`buyers` integer,
	`sellers` integer,
	`smart_money_count` integer DEFAULT 0 NOT NULL,
	`security_score` integer DEFAULT 0 NOT NULL,
	`narrative_score` integer DEFAULT 0 NOT NULL,
	`momentum_score` integer DEFAULT 0 NOT NULL,
	`total_score` integer DEFAULT 0 NOT NULL,
	`ai_decision` text DEFAULT 'HOLD' NOT NULL,
	`ai_confidence` real DEFAULT 0 NOT NULL,
	`ai_reason` text DEFAULT '证据不足，继续观察' NOT NULL,
	`hard_filter_passed` integer DEFAULT 0 NOT NULL,
	`reject_reason` text,
	`data_freshness_ms` integer,
	`source_status_json` text DEFAULT '{}' NOT NULL,
	`raw_input_json` text DEFAULT '{}' NOT NULL,
	`discovered_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_signals_chain_token` ON `radar_signals` (`chain`,`token_address`);--> statement-breakpoint
CREATE INDEX `idx_radar_signals_status_time` ON `radar_signals` (`status`,`first_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_radar_signals_score` ON `radar_signals` (`total_score`);--> statement-breakpoint
CREATE TABLE `strategy_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` text DEFAULT 'radar-paper-v1' NOT NULL,
	`buy_amount_usd` text DEFAULT '25' NOT NULL,
	`max_per_token_usd` text DEFAULT '50' NOT NULL,
	`max_open_positions` integer DEFAULT 5 NOT NULL,
	`max_daily_buys` integer DEFAULT 5 NOT NULL,
	`max_daily_loss_usd` text DEFAULT '50' NOT NULL,
	`min_security_score` integer DEFAULT 70 NOT NULL,
	`min_narrative_score` integer DEFAULT 60 NOT NULL,
	`min_total_score` integer DEFAULT 70 NOT NULL,
	`min_ai_confidence` real DEFAULT 0.7 NOT NULL,
	`max_slippage_bps` integer DEFAULT 300 NOT NULL,
	`max_price_impact_bps` integer DEFAULT 1000 NOT NULL,
	`allowed_chains_json` text DEFAULT '["sol","bsc","base","robinhood"]' NOT NULL,
	`auto_trade_enabled` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`horizon` text NOT NULL,
	`observed_at` text NOT NULL,
	`net_return_bps` integer,
	`max_upside_bps` integer,
	`max_drawdown_bps` integer,
	`sellable` integer,
	`liquidity_removed` integer DEFAULT 0 NOT NULL,
	`zeroed` integer DEFAULT 0 NOT NULL,
	`paper_result_json` text DEFAULT '{}' NOT NULL,
	`data_freshness_ms` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_trade_outcomes_signal_horizon` ON `trade_outcomes` (`radar_signal_id`,`horizon`);--> statement-breakpoint
CREATE TABLE `user_trading_wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`namespace` text NOT NULL,
	`public_address` text,
	`custody_provider` text DEFAULT 'NOT_PROVISIONED' NOT NULL,
	`key_reference` text,
	`status` text DEFAULT 'disabled' NOT NULL,
	`withdrawal_allowlist_json` text DEFAULT '[]' NOT NULL,
	`daily_limit_usd` text DEFAULT '0' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_trading_wallets_user_namespace` ON `user_trading_wallets` (`user_id`,`namespace`);--> statement-breakpoint
CREATE TABLE `user_wallet_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`namespace` text NOT NULL,
	`chain` text NOT NULL,
	`wallet_address` text NOT NULL,
	`verified_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_wallet_accounts_identity` ON `user_wallet_accounts` (`namespace`,`chain`,`wallet_address`);--> statement-breakpoint
CREATE TABLE `wallet_auth_nonces` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`chain` text NOT NULL,
	`wallet_address` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_auth_nonces_expiry` ON `wallet_auth_nonces` (`expires_at`);