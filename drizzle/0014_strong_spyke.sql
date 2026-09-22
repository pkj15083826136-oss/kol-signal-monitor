CREATE TABLE `collector_status` (
	`source` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`connection_status` text DEFAULT 'not_started' NOT NULL,
	`login_status` text DEFAULT 'unknown' NOT NULL,
	`websocket_status` text DEFAULT 'unknown' NOT NULL,
	`last_heartbeat_at` text,
	`last_event_at` text,
	`last_upload_at` text,
	`captured_count` integer DEFAULT 0 NOT NULL,
	`uploaded_count` integer DEFAULT 0 NOT NULL,
	`dedup_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text NOT NULL
);
