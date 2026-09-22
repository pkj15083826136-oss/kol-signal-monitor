CREATE TABLE `api_usage_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`cache_hits` integer DEFAULT 0 NOT NULL,
	`filtered_saved` integer DEFAULT 0 NOT NULL,
	`last_known_good_uses` integer DEFAULT 0 NOT NULL,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_usage_metrics_time` ON `api_usage_metrics` (`kind`,`captured_at`);--> statement-breakpoint
CREATE TABLE `narrative_manual_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`narrative` text NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`verdict` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_narrative_manual_cases_token` ON `narrative_manual_cases` (`chain`,`token_address`);--> statement-breakpoint
CREATE TABLE `narrative_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`frozen_input_json` text DEFAULT '{}' NOT NULL,
	`first_signal_at` text NOT NULL,
	`outcome_group` text DEFAULT 'UNKNOWN' NOT NULL,
	`multiple_kind` text DEFAULT 'UNVERIFIED_MARKET_MULTIPLE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_narrative_samples_signal` ON `narrative_samples` (`radar_signal_id`);--> statement-breakpoint
CREATE TABLE `prompt_rule_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`rules_json` text DEFAULT '[]' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`parent_version` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`published_at` text,
	`rollback_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_prompt_rule_versions_version` ON `prompt_rule_versions` (`version`);--> statement-breakpoint
CREATE INDEX `idx_prompt_rule_versions_status` ON `prompt_rule_versions` (`status`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `market_price` text;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `market_cap` real;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `liquidity` real;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `holders` integer;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `quote_status` text DEFAULT 'NOT_QUOTED' NOT NULL;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `source` text;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `source_timestamp` text;--> statement-breakpoint
ALTER TABLE `trade_outcomes` ADD `multiple_kind` text DEFAULT 'UNVERIFIED_MARKET_MULTIPLE' NOT NULL;