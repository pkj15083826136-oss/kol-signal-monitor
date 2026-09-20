ALTER TABLE `snapshots` ADD `position_delta` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `coverage_ratio` real;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `missing_reason` text;