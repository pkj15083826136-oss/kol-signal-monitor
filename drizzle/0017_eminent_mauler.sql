ALTER TABLE `external_api_cache` ADD `lookup_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `external_api_cache` ADD `hit_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `external_api_cache` ADD `negative_hit_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `external_api_cache` ADD `coalesced_count` integer DEFAULT 0 NOT NULL;