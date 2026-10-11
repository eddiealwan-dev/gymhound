CREATE TABLE `water_log` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`logged_at` integer NOT NULL,
	`amount_ml` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `water_log_local_date_idx` ON `water_log` (`local_date`);