CREATE TABLE `radar_narrative_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`task_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`prompt_version` text NOT NULL,
	`model_version` text NOT NULL,
	`decision` text DEFAULT 'HOLD' NOT NULL,
	`score` integer,
	`risk_score` integer,
	`freshness_score` integer,
	`sentiment_score` integer,
	`lead_score` integer,
	`stage` text DEFAULT 'unknown' NOT NULL,
	`confidence` real,
	`summary` text DEFAULT '' NOT NULL,
	`positive_reasons_json` text DEFAULT '[]' NOT NULL,
	`negative_reasons_json` text DEFAULT '[]' NOT NULL,
	`invalidators_json` text DEFAULT '[]' NOT NULL,
	`recommended_action` text DEFAULT 'HOLD' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`input_summary_json` text DEFAULT '{}' NOT NULL,
	`input_cutoff_at` text NOT NULL,
	`analysis_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_microusd` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_narrative_task` ON `radar_narrative_analysis` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_radar_narrative_signal_time` ON `radar_narrative_analysis` (`radar_signal_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `radar_trade_eligibility` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_signal_id` integer NOT NULL,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`identity_status` text DEFAULT 'UNVERIFIED' NOT NULL,
	`short_reason` text DEFAULT '交易条件待补全' NOT NULL,
	`checks_json` text DEFAULT '[]' NOT NULL,
	`risk_comments_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_radar_trade_signal` ON `radar_trade_eligibility` (`radar_signal_id`);--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `dex_id` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `router_id` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `launchpad_id` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `factory_address` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_pair_label` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `identity_status` text DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `narrative_score_v2` integer;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `narrative_status` text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `narrative_summary` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `narrative_updated_at` text;