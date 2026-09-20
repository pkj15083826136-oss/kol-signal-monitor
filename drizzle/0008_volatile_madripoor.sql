ALTER TABLE `signals` ADD `website` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `socials_json` text DEFAULT '{}' NOT NULL;