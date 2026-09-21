ALTER TABLE `signals` ADD `signal_origin` text DEFAULT 'kol_monitor' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `radar_signal_id` integer;--> statement-breakpoint
ALTER TABLE `signals` ADD `radar_score` integer;