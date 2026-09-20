ALTER TABLE `monitor_runs` ADD `data_review_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `market_conflict_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `official_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `description_source` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `description_updated_at` text;--> statement-breakpoint
ALTER TABLE `source_health` ADD `next_retry_at` text;--> statement-breakpoint
ALTER TABLE `source_health` ADD `impact` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
DELETE FROM `market_reviews`
WHERE `chain` = 'sol' AND `token_address` = '98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 938806
WHERE `chain` = 'sol' AND `token_address` = 'DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 46806911, `alert_status` = 'suppressed', `alert_error` = 'invalid_market_data: corrected token-level market cap; no correction message sent'
WHERE `chain` = 'sol' AND `token_address` = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 84919991, `alert_status` = 'suppressed', `alert_error` = 'invalid_market_data: corrected token-level market cap; no correction message sent'
WHERE `chain` = 'sol' AND `token_address` = 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 202512469, `alert_status` = 'suppressed', `alert_error` = 'invalid_market_data: wrapped mature asset; no correction message sent'
WHERE `chain` = 'sol' AND `token_address` = '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 7434
WHERE `chain` = 'bsc' AND `token_address` = '0x459c0e0ef66da505b2459610aca1db41031ca898';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 344154552, `alert_status` = 'suppressed', `alert_error` = 'invalid_market_data: corrected token-level market cap; no correction message sent'
WHERE `chain` = 'sol' AND `token_address` = 'CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 9762
WHERE `chain` = 'bsc' AND `token_address` = '0xd49362ce2750f3c9e34863d23217e6050e005076';
--> statement-breakpoint
UPDATE `signals` SET `market_cap` = 1171964
WHERE `chain` = 'sol' AND `token_address` = 'PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m';
