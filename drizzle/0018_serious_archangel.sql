CREATE TABLE `xai_request_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`response_id` text,
	`radar_signal_id` integer,
	`candidate_id` text,
	`chain` text DEFAULT '' NOT NULL,
	`token_address` text DEFAULT '' NOT NULL,
	`task_type` text NOT NULL,
	`entry_point` text NOT NULL,
	`claim_fingerprint` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`x_search_calls` integer,
	`x_posts_fetched` integer,
	`x_users_fetched` integer,
	`cost_in_usd_ticks` integer,
	`fetch_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_xai_request_usage_request` ON `xai_request_usage` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_xai_request_usage_task_time` ON `xai_request_usage` (`task_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_xai_request_usage_fetch_time` ON `xai_request_usage` (`fetch_status`,`created_at`);--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `meme_potential_score` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `catalyst_evidence_score` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `cost_in_usd_ticks` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `search_plan_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `claim_fingerprint` text;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `analysis_stage` text DEFAULT 'NARRATIVE_DISCOVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `x_search_calls` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `x_posts_fetched` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `x_users_fetched` integer;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `fetch_status` text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE `radar_narrative_analysis` ADD `response_id` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_project_description` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_description_raw` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_description_at` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_description_source` text;--> statement-breakpoint
ALTER TABLE `radar_signals` ADD `source_description_fingerprint` text;