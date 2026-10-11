CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`taken_at` integer NOT NULL,
	`file_name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `progress_photos_local_date_idx` ON `progress_photos` (`local_date`);