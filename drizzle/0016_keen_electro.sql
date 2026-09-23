CREATE TABLE `external_api_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`endpoint` text NOT NULL,
	`chain` text DEFAULT '' NOT NULL,
	`token_address` text DEFAULT '' NOT NULL,
	`payload_json` text,
	`negative` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`stale_until` text NOT NULL,
	`lock_owner` text,
	`lock_until` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_external_api_cache_expiry` ON `external_api_cache` (`provider`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_external_api_cache_token` ON `external_api_cache` (`chain`,`token_address`);--> statement-breakpoint
CREATE TABLE `external_api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`provider` text NOT NULL,
	`tier` text NOT NULL,
	`endpoint` text NOT NULL,
	`task` text NOT NULL,
	`chain` text DEFAULT '' NOT NULL,
	`token_count` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`retry_number` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_external_api_usage_request` ON `external_api_usage` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_external_api_usage_budget` ON `external_api_usage` (`provider`,`tier`,`captured_at`);--> statement-breakpoint
CREATE INDEX `idx_external_api_usage_endpoint` ON `external_api_usage` (`endpoint`,`captured_at`);