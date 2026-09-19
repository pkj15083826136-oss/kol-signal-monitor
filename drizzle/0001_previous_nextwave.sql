ALTER TABLE `signals` ADD `alert_status` text DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_error` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_last_attempt_at` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_sent_at` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `alert_payload_json` text DEFAULT '' NOT NULL;