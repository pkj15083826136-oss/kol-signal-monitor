UPDATE `signals`
SET `market_cap` = 65360200,
    `liquidity` = 9921946,
    `holders` = 51953,
    `volume_24h` = 18315345,
    `price` = '92.50134',
    `alert_status` = 'suppressed',
    `alert_error` = 'invalid_market_data: corrected from Ave token-level market_cap; confirmed mature asset; no correction message sent'
WHERE `chain` = 'sol'
  AND `token_address` IN ('98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g');
--> statement-breakpoint
UPDATE `market_reviews`
SET `market_cap` = 65360200.241969295,
    `market_cap_source` = 'ave',
    `holder_count` = 51953,
    `holder_source` = 'ave',
    `source_values_json` = '{"ave":65360200.241969295}',
    `last_checked_at` = '2026-09-19T18:37:41.291Z'
WHERE `chain` = 'sol'
  AND `token_address` IN ('98sMhvDwXj1RQj5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g');
