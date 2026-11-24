import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const groceries = sqliteTable(
  "groceries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    nameKey: text("name_key").notNull(),
    unit: text().notNull().default(""),
    location: text(),
  },
  (t) => [uniqueIndex("groceries_name_key").on(t.nameKey)],
);

export const products = sqliteTable("products", {
  groceryId: integer("grocery_id")
    .primaryKey()
    .references(() => groceries.id, { onDelete: "cascade" }),
  store: text({ enum: ["walmart", "amazon"] }).notNull(),
  storeId: text("store_id").notNull(),
  name: text().notNull().default(""),
  size: text().notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  soldBy: text("sold_by", { enum: ["each", "pound"] }).notNull().default("each"),
});

export const recipes = sqliteTable("recipes", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  servings: text().notNull().default(""),
  prepTime: integer("prep_time"),
  cookTime: integer("cook_time"),
  steps: text({ mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  note: text().notNull().default(""),
  sourceName: text("source_name").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  rating: integer(),
  photo: text(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const collections = sqliteTable("collections", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  position: integer().notNull().default(0),
});

export const recipeCollections = sqliteTable(
  "recipe_collections",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.collectionId] })],
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    kind: text({ enum: ["heading", "ingredient"] }).notNull(),
    heading: text().notNull().default(""),
    groceryId: integer("grocery_id").references(() => groceries.id),
    cookingAmount: text("cooking_amount").notNull().default(""),
    preparation: text().notNull().default(""),
    optional: integer({ mode: "boolean" }).notNull().default(false),
    subRecipeId: integer("sub_recipe_id").references((): AnySQLiteColumn => recipes.id, { onDelete: "set null" }),
    raw: text().notNull().default(""),
  },
  (t) => [index("ingredients_recipe").on(t.recipeId), index("ingredients_grocery").on(t.groceryId)],
);

export const lists = sqliteTable("lists", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  kind: text({ enum: ["essentials", "grocery"] }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const listItems = sqliteTable(
  "list_items",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    groceryId: integer("grocery_id")
      .notNull()
      .references(() => groceries.id),
    amount: real(),
    details: text().notNull().default(""),
    done: integer({ mode: "boolean" }).notNull().default(false),
    position: integer().notNull().default(0),
  },
  (t) => [index("list_items_list").on(t.listId)],
);

export const mergeSuggestions = sqliteTable("merge_suggestions", {
  id: integer().primaryKey({ autoIncrement: true }),
  groceryA: integer("grocery_a")
    .notNull()
    .references(() => groceries.id, { onDelete: "cascade" }),
  groceryB: integer("grocery_b")
    .notNull()
    .references(() => groceries.id, { onDelete: "cascade" }),
  status: text({ enum: ["pending", "kept"] }).notNull().default("pending"),
});

export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});
