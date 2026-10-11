ALTER TABLE `exercises` ADD `instructions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `exercises` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `retired` integer DEFAULT false NOT NULL;