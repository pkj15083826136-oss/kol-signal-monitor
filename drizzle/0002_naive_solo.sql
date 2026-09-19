CREATE TABLE `source_health` (
	`source` text NOT NULL,
	`chain` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_attempt_at` text NOT NULL,
	`last_success_at` text,
	`last_failure_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	PRIMARY KEY(`source`, `chain`)
);
--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `chain` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `fetched_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `matched_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `feed_errors_json` text DEFAULT '[]' NOT NULL;