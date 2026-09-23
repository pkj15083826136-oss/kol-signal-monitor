CREATE TABLE `dex_registry` (
	`chain` text NOT NULL,
	`dex_id` text NOT NULL,
	`pool_type` text NOT NULL,
	`factory_address` text NOT NULL,
	`router_address` text NOT NULL,
	`quote_tokens_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'VERIFIED' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`chain`, `dex_id`, `factory_address`)
);
--> statement-breakpoint
CREATE TABLE `radar_enrichment_state` (
	`radar_signal_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`trade_data_stage` text DEFAULT 'CANDIDATE_ONLY' NOT NULL,
	`avatar_original_url` text,
	`avatar_resolved_url` text,
	`avatar_source` text,
	`avatar_checked_at` text,
	`avatar_status` text DEFAULT 'PENDING' NOT NULL,
	`avatar_error_code` text,
	`primary_pair_address` text,
	`pool_type` text,
	`dex_id` text,
	`factory_address` text,
	`router_address` text,
	`quote_token` text,
	`pair_status` text DEFAULT 'PENDING' NOT NULL,
	`pair_source` text,
	`pair_checked_at` text,
	`pair_block_number` integer,
	`liquidity_usd` real,
	`liquidity_source` text,
	`liquidity_status` text DEFAULT 'PENDING' NOT NULL,
	`liquidity_checked_at` text,
	`data_conflict` integer DEFAULT 0 NOT NULL,
	`unique_buyers_24h` integer,
	`unique_sellers_24h` integer,
	`buy_tx_24h` integer,
	`sell_tx_24h` integer,
	`activity_source` text,
	`activity_status` text DEFAULT 'PENDING' NOT NULL,
	`activity_window_start` text,
	`activity_window_end` text,
	`token_created_at` text,
	`token_created_source` text,
	`token_created_status` text DEFAULT 'PENDING' NOT NULL,
	`pool_created_at` text,
	`pool_created_source` text,
	`pool_created_status` text DEFAULT 'PENDING' NOT NULL,
	`system_first_seen_at` text NOT NULL,
	`error_code` text,
	`error_reason` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`terminal` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `dex_registry` (`chain`,`dex_id`,`pool_type`,`factory_address`,`router_address`,`quote_tokens_json`,`status`,`updated_at`) VALUES
('bsc','cakev2','V2','0xca143ce32fe78f1f7019d7d551a6402fc5350c73','0x10ed43c718714eb63d5aa57b78b54704e256024e','[{"address":"0x55d398326f99059ff775485246999027b3197955","symbol":"USDT","decimals":18,"stable":true},{"address":"0xe9e7cea3dedca5984780bafc599bd69add087d56","symbol":"BUSD","decimals":18,"stable":true},{"address":"0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c","symbol":"WBNB","decimals":18,"stable":false}]','VERIFIED','2026-09-24T00:00:00.000Z'),
('bsc','pancakev3','V3','0x0bfbCF9fa4f9C56B0F40a671Ad40E0805A091865','0x1b81D678ffb9C0263b24A97847620C99d213eB14','[{"address":"0x55d398326f99059ff775485246999027b3197955","symbol":"USDT","decimals":18,"stable":true},{"address":"0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c","symbol":"WBNB","decimals":18,"stable":false}]','VERIFIED','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
CREATE INDEX `idx_radar_enrichment_retry` ON `radar_enrichment_state` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `radar_ingest_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_event_id` text NOT NULL,
	`radar_signal_id` integer,
	`chain` text,
	`token_address` text,
	`outcome` text NOT NULL,
	`reason` text,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_ingest_event` ON `radar_ingest_events` (`source`,`source_event_id`);--> statement-breakpoint
CREATE INDEX `idx_radar_ingest_time` ON `radar_ingest_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `radar_pool_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`pair_address` text NOT NULL,
	`pool_type` text,
	`dex_id` text,
	`factory_address` text,
	`router_address` text,
	`token0` text,
	`token1` text,
	`quote_token` text,
	`fee_tier` integer,
	`liquidity_usd` real,
	`liquidity_source` text,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`block_number` integer,
	`checked_at` text NOT NULL,
	`error_code` text,
	`error_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_pool_candidate` ON `radar_pool_candidates` (`radar_signal_id`,`pair_address`);--> statement-breakpoint
CREATE INDEX `idx_radar_pool_signal` ON `radar_pool_candidates` (`radar_signal_id`);--> statement-breakpoint
CREATE TABLE `radar_readonly_quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`amount_usd` integer NOT NULL,
	`buy_amount_out` text,
	`sell_amount_out_usd` text,
	`price_impact_bps` integer,
	`round_trip_loss_bps` integer,
	`status` text NOT NULL,
	`error_code` text,
	`quoted_at` text NOT NULL,
	`block_number` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_quote_band` ON `radar_readonly_quotes` (`radar_signal_id`,`amount_usd`);--> statement-breakpoint
ALTER TABLE `collector_status` ADD `upload_failed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collector_status` ADD `parse_failed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collector_status` ADD `unsupported_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collector_status` ADD `invalid_count` integer DEFAULT 0 NOT NULL;
