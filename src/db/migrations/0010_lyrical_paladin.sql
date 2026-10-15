ALTER TABLE `routine_exercises` ADD `ladder_rung` integer;--> statement-breakpoint
ALTER TABLE `routine_exercises` ADD `next_set_count` integer;--> statement-breakpoint
ALTER TABLE `routines` ADD `run_started_at` integer;--> statement-breakpoint
ALTER TABLE `routines` ADD `run_deload_at` integer;--> statement-breakpoint
ALTER TABLE `sets` ADD `extra_reps` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `missed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `rule_kind` text;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `rule_rung` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `next_rung` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `next_set_count` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `program_week` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `week_kind` text;