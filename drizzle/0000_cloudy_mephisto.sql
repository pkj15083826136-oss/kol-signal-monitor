CREATE TABLE `hot_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`author` text NOT NULL,
	`posted_at` text,
	`url` text NOT NULL,
	`original` text NOT NULL,
	`chinese` text NOT NULL,
	`engagement` text
);
--> statement-breakpoint
CREATE INDEX `idx_hot_posts_signal` ON `hot_posts` (`signal_id`);--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`new_trades` integer DEFAULT 0 NOT NULL,
	`new_signals` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`name` text DEFAULT 'Unknown' NOT NULL,
	`symbol` text DEFAULT '—' NOT NULL,
	`logo` text,
	`threshold` integer NOT NULL,
	`holder_count` integer NOT NULL,
	`market_cap` integer DEFAULT 0 NOT NULL,
	`liquidity` integer DEFAULT 0 NOT NULL,
	`holders` integer DEFAULT 0 NOT NULL,
	`volume_24h` integer DEFAULT 0 NOT NULL,
	`price` text DEFAULT '0' NOT NULL,
	`gmgn_theme` text DEFAULT '暂无' NOT NULL,
	`ai_analysis` text DEFAULT '等待有效社媒讨论' NOT NULL,
	`wallet_names_json` text DEFAULT '[]' NOT NULL,
	`alerted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_signals_token_threshold` ON `signals` (`chain`,`token_address`,`threshold`);--> statement-breakpoint
CREATE INDEX `idx_signals_alerted_at` ON `signals` (`alerted_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`holder_count` integer NOT NULL,
	`total_buy_usd` integer NOT NULL,
	`total_token_amount` real DEFAULT 0 NOT NULL,
	`market_value` real NOT NULL,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_token_time` ON `snapshots` (`chain`,`token_address`,`captured_at`);--> statement-breakpoint
CREATE TABLE `token_wallets` (
	`chain` text NOT NULL,
	`token_address` text NOT NULL,
	`wallet_address` text NOT NULL,
	`wallet_name` text NOT NULL,
	`first_buy_at` text NOT NULL,
	`last_buy_at` text NOT NULL,
	`buy_usd` integer DEFAULT 0 NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`chain`, `token_address`, `wallet_address`)
);
--> statement-breakpoint
CREATE INDEX `idx_token_wallets_token` ON `token_wallets` (`chain`,`token_address`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`wallet_address` text NOT NULL,
	`wallet_name` text NOT NULL,
	`token_address` text NOT NULL,
	`side` text NOT NULL,
	`amount_usd` integer,
	`token_amount` text,
	`traded_at` text NOT NULL,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trades_token_time` ON `trades` (`chain`,`token_address`,`traded_at`);