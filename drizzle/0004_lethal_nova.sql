CREATE TABLE `market_reviews` (
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`market_cap` real,
	`market_cap_source` text,
	`market_data_conflict` integer DEFAULT 0 NOT NULL,
	`source_values_json` text DEFAULT '{}' NOT NULL,
	`holder_count` integer,
	`holder_source` text,
	`token_created_at` text,
	`identity_verified` integer DEFAULT 0 NOT NULL,
	`last_checked_at` text NOT NULL,
	PRIMARY KEY(`chain`, `token_address`)
);
--> statement-breakpoint
UPDATE `signals`
SET `alert_status` = 'suppressed',
    `alert_error` = 'invalid_market_data: confirmed mature asset HYPE; no correction message sent'
WHERE `chain` = 'sol'
  AND `token_address` IN ('98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g');
--> statement-breakpoint
INSERT OR REPLACE INTO `market_reviews`
  (`chain`, `token_address`, `status`, `reason`, `market_data_conflict`, `source_values_json`, `identity_verified`, `last_checked_at`)
VALUES
  ('sol', '98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', 'suppressed', 'confirmed_mature_asset_invalid_market_data', 0, '{}', 1, CURRENT_TIMESTAMP);
--> statement-breakpoint
INSERT OR REPLACE INTO `market_reviews`
  (`chain`, `token_address`, `status`, `reason`, `market_data_conflict`, `source_values_json`, `identity_verified`, `last_checked_at`)
VALUES
  ('sol', '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', 'suppressed', 'confirmed_mature_asset_invalid_market_data', 0, '{}', 1, CURRENT_TIMESTAMP);
