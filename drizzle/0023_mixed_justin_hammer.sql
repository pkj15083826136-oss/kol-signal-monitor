CREATE TABLE `stablecoin_mint_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`provider` text NOT NULL,
	`chain` text NOT NULL,
	`symbol` text NOT NULL,
	`token_contract` text NOT NULL,
	`raw_amount` text NOT NULL,
	`amount` text NOT NULL,
	`amount_usd` real NOT NULL,
	`tx_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`issuer` text NOT NULL,
	`recipient_address` text,
	`evidence_type` text NOT NULL,
	`issuance_classification` text NOT NULL,
	`source_url` text NOT NULL,
	`contract_evidence_url` text NOT NULL,
	`chain_occurred_at` text NOT NULL,
	`discovered_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_stablecoin_mint_event_key` ON `stablecoin_mint_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_stablecoin_mint_time` ON `stablecoin_mint_events` (`chain_occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_stablecoin_mint_symbol_time` ON `stablecoin_mint_events` (`symbol`,`chain_occurred_at`);--> statement-breakpoint
ALTER TABLE `fund_flow_events` ADD `token_contract` text;--> statement-breakpoint
ALTER TABLE `fund_flow_events` ADD `raw_amount` text;--> statement-breakpoint
ALTER TABLE `fund_flow_events` ADD `price_source` text;--> statement-breakpoint
ALTER TABLE `fund_flow_events` ADD `valuation_status` text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
UPDATE `fund_flow_events`
SET `token_contract` = CASE UPPER(`symbol`)
	WHEN 'USDT' THEN '0xdac17f958d2ee523a2206206994597c13d831ec7'
	WHEN 'USDC' THEN '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
	ELSE `token_contract`
END,
`price_source` = CASE
	WHEN `valuation_method` = 'stablecoin_nominal_usd' THEN '发行方 1 美元锚定名义值'
	ELSE `price_source`
END
WHERE `provider` = 'public_rpc' AND UPPER(`symbol`) IN ('USDT', 'USDC');
