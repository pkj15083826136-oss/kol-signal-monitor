ALTER TABLE `exchange_events` ADD `title_zh` text;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translation_provider` text;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translation_source_hash` text;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translation_error` text;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translated_at` text;--> statement-breakpoint
ALTER TABLE `exchange_events` ADD `translation_char_count` integer DEFAULT 0 NOT NULL;