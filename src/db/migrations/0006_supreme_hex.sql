CREATE TABLE `exercise_photos` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`start_file` text,
	`end_file` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`local_date` text NOT NULL,
	`measured_at` integer NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `measurements_kind_date_idx` ON `measurements` (`kind`,`local_date`);--> statement-breakpoint
CREATE TABLE `saved_workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`saved_workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_group` integer,
	`sets` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`saved_workout_id`) REFERENCES `saved_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `saved_workout_exercises_saved_workout_id_idx` ON `saved_workout_exercises` (`saved_workout_id`);--> statement-breakpoint
CREATE TABLE `saved_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workouts` ADD `saved_workout_id` text;