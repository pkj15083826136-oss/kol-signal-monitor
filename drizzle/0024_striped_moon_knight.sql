ALTER TABLE `stablecoin_mint_events` ADD `block_number` integer;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `verification_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `transaction_to` text;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `call_selector` text;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `zero_address_transfer_log_index` integer;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `supply_before_raw` text;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `supply_after_raw` text;--> statement-breakpoint
ALTER TABLE `stablecoin_mint_events` ADD `supply_delta_raw` text;