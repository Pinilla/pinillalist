ALTER TABLE `ingredients` ADD `optional` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredients` ADD `sub_recipe_id` integer REFERENCES recipes(id) ON DELETE set null;