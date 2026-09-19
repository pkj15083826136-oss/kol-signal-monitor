CREATE TABLE `user_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain` text NOT NULL,
	`network` text NOT NULL,
	`tx_hash` text NOT NULL,
	`wallet_address` text NOT NULL,
	`sell_token` text NOT NULL,
	`buy_token` text NOT NULL,
	`sell_amount` text NOT NULL,
	`minimum_out` text NOT NULL,
	`status` text NOT NULL,
	`approval_tx_hash` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`confirmed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_user_trades_chain_hash` ON `user_trades` (`chain`,`tx_hash`);--> statement-breakpoint
CREATE INDEX `idx_user_trades_wallet_time` ON `user_trades` (`wallet_address`,`created_at`);