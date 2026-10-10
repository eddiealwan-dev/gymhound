CREATE TABLE `exercise_prefs` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`rest_seconds` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
