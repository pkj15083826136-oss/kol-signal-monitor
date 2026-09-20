CREATE TABLE `provider_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`data_kind` text NOT NULL,
	`interval` integer DEFAULT 0 NOT NULL,
	`bucket` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`success` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`cache_hit` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`identity_verified` integer DEFAULT 0 NOT NULL,
	`available_fields_json` text DEFAULT '[]' NOT NULL,
	`source_timestamp` text,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_provider_samples_bucket` ON `provider_samples` (`source`,`chain`,`token_address`,`data_kind`,`interval`,`bucket`);--> statement-breakpoint
CREATE INDEX `idx_provider_samples_time` ON `provider_samples` (`source`,`captured_at`);