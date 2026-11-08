CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groceries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groceries_name_key` ON `groceries` (`name_key`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`heading` text DEFAULT '' NOT NULL,
	`grocery_id` integer,
	`cooking_amount` text DEFAULT '' NOT NULL,
	`preparation` text DEFAULT '' NOT NULL,
	`buying_amount` real,
	`raw` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grocery_id`) REFERENCES `groceries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingredients_recipe` ON `ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `ingredients_grocery` ON `ingredients` (`grocery_id`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`grocery_id` integer NOT NULL,
	`amount` real,
	`details` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grocery_id`) REFERENCES `groceries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `list_items_list` ON `list_items` (`list_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `merge_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grocery_a` integer NOT NULL,
	`grocery_b` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`grocery_a`) REFERENCES `groceries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grocery_b`) REFERENCES `groceries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`grocery_id` integer PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`store_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`size` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`sold_by` text DEFAULT 'each' NOT NULL,
	FOREIGN KEY (`grocery_id`) REFERENCES `groceries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_collections` (
	`recipe_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `collection_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`servings` text DEFAULT '' NOT NULL,
	`prep_time` integer,
	`cook_time` integer,
	`steps` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source_name` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`rating` integer,
	`photo` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
