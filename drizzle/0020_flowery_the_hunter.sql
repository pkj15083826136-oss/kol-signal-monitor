CREATE TABLE `exchange_alert_deliveries` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`delivery_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_attempt_at` text,
	`sent_at` text,
	`last_error` text,
	`payload_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_exchange_delivery_key` ON `exchange_alert_deliveries` (`delivery_key`);--> statement-breakpoint
CREATE TABLE `exchange_collector_state` (
	`source` text PRIMARY KEY NOT NULL,
	`exchange` text NOT NULL,
	`status` text NOT NULL,
	`cursor` text,
	`last_attempt_at` text NOT NULL,
	`last_success_at` text,
	`last_event_at` text,
	`last_latency_ms` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`last_error` text,
	`coverage_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_event_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`revision` integer NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_exchange_revision` ON `exchange_event_revisions` (`event_id`,`revision`);--> statement-breakpoint
CREATE TABLE `exchange_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`exchange` text NOT NULL,
	`event_type` text NOT NULL,
	`market_type` text DEFAULT 'unknown' NOT NULL,
	`title` text NOT NULL,
	`assets_json` text DEFAULT '[]' NOT NULL,
	`pairs_json` text DEFAULT '[]' NOT NULL,
	`conditions` text,
	`announcement_id` text,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_kind` text NOT NULL,
	`announcement_at` text,
	`discovered_at` text NOT NULL,
	`expected_effective_at` text,
	`actual_effective_at` text,
	`activity_start_at` text,
	`activity_end_at` text,
	`status` text DEFAULT 'announced' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`content_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_exchange_events_key` ON `exchange_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_exchange_events_time` ON `exchange_events` (`discovered_at`);--> statement-breakpoint
CREATE INDEX `idx_exchange_events_filter` ON `exchange_events` (`exchange`,`event_type`,`market_type`,`status`);--> statement-breakpoint
CREATE TABLE `exchange_pair_snapshots` (
	`exchange` text NOT NULL,
	`market_type` text NOT NULL,
	`pairs_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`initialized_at` text NOT NULL,
	`captured_at` text NOT NULL,
	`source_url` text NOT NULL,
	PRIMARY KEY(`exchange`, `market_type`)
);
--> statement-breakpoint
CREATE TABLE `fund_flow_alert_deliveries` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`delivery_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_attempt_at` text,
	`sent_at` text,
	`last_error` text,
	`payload_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_fund_flow_delivery_key` ON `fund_flow_alert_deliveries` (`delivery_key`);--> statement-breakpoint
CREATE TABLE `fund_flow_collector_state` (
	`source` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`cursor` text,
	`connection_status` text DEFAULT 'not_started' NOT NULL,
	`last_attempt_at` text NOT NULL,
	`last_success_at` text,
	`last_event_at` text,
	`last_heartbeat_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`last_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`coverage_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fund_flow_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`provider` text NOT NULL,
	`chain` text NOT NULL,
	`symbol` text NOT NULL,
	`amount` text NOT NULL,
	`amount_usd` real,
	`price_usd` real,
	`price_at` text,
	`tx_hash` text NOT NULL,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`from_entity` text,
	`to_entity` text,
	`from_label_source` text,
	`to_label_source` text,
	`label_confidence` text DEFAULT 'unverified' NOT NULL,
	`direction` text NOT NULL,
	`classification` text NOT NULL,
	`counts_toward_netflow` integer DEFAULT 0 NOT NULL,
	`institution_trade_side` text,
	`bridge_name` text,
	`chain_occurred_at` text NOT NULL,
	`discovered_at` text NOT NULL,
	`raw_fingerprint` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_fund_flow_event_key` ON `fund_flow_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_fund_flow_time` ON `fund_flow_events` (`chain_occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_fund_flow_rollup` ON `fund_flow_events` (`symbol`,`chain`,`direction`,`chain_occurred_at`);
--> statement-breakpoint
PRAGMA optimize;
