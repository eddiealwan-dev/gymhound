CREATE TABLE `bodyweight` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`measured_at` integer NOT NULL,
	`weight` real NOT NULL,
	`unit` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bodyweight_local_date_idx` ON `bodyweight` (`local_date`);--> statement-breakpoint
CREATE TABLE `exercise_notes` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text NOT NULL,
	`equipment` text NOT NULL,
	`pattern` text NOT NULL,
	`logging_type` text NOT NULL,
	`is_custom` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `food_log` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`logged_at` integer NOT NULL,
	`food_id` text,
	`name` text NOT NULL,
	`servings` real NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `food_log_local_date_idx` ON `food_log` (`local_date`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`serving_label` text NOT NULL,
	`serving_grams` real,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`source` text NOT NULL,
	`barcode` text,
	`archived` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_days` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_day_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_group` integer,
	`set_count` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`increment` real NOT NULL,
	`increment_unit` text NOT NULL,
	`next_weight` real,
	`next_weight_unit` text,
	FOREIGN KEY (`routine_day_id`) REFERENCES `routine_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_premade` integer NOT NULL,
	`next_day_index` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_type` text NOT NULL,
	`weight` real,
	`weight_unit` text,
	`reps` integer,
	`rpe` real,
	`duration_s` integer,
	`distance` real,
	`distance_unit` text,
	`done` integer DEFAULT false NOT NULL,
	`pr_flags` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_workout_exercise_id_idx` ON `sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`routine_exercise_id` text,
	`position` integer NOT NULL,
	`superset_group` integer,
	`show_rpe` integer NOT NULL,
	`rule_set_count` integer,
	`rule_rep_min` integer,
	`rule_rep_max` integer,
	`rule_increment` real,
	`rule_increment_unit` text,
	`planned_weight` real,
	`planned_unit` text,
	`override_weight` real,
	`override_unit` text,
	`working_weight` real,
	`working_unit` text,
	`outcome` text,
	`next_weight` real,
	`next_unit` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_id_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_id_idx` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_routine_exercise_id_idx` ON `workout_exercises` (`routine_exercise_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`routine_id` text,
	`routine_day_id` text,
	`status` text NOT NULL,
	`day_mark` text DEFAULT 'normal' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`local_date` text NOT NULL,
	`rest_ends_at` integer,
	`food_offer_shown` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workouts_status_idx` ON `workouts` (`status`);--> statement-breakpoint
CREATE INDEX `workouts_local_date_idx` ON `workouts` (`local_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_workout` ON `workouts` (`status`) WHERE status = 'active';