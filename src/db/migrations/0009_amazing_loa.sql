ALTER TABLE `workouts` ADD `health_status` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `health_record_id` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `sleep_offer_shown` integer DEFAULT false NOT NULL;