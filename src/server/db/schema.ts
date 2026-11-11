import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/** The household's catalog of groceries. `nameKey` is the lowercased name, kept unique. */
export const groceries = sqliteTable(
  "groceries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    nameKey: text("name_key").notNull(),
    unit: text().notNull().default(""),
    /** A key from LOCATIONS in src/shared/locations.ts, or null. */
    location: text(),
  },
  (t) => [uniqueIndex("groceries_name_key").on(t.nameKey)],
);

/** The one store product a grocery is linked to. */
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
  /** Seconds, as AnyList stores them. */
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

/** A recipe's ingredient list, in order. A row is either a section heading or an ingredient. */
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
    /** Optional ingredients reach the weekly order only when someone picks them along with the recipe. */
    optional: integer({ mode: "boolean" }).notNull().default(false),
    /**
     * Set when this ingredient is something the household makes from another recipe,
     * such as a sauce. The grocery is then what to buy instead of making it.
     */
    subRecipeId: integer("sub_recipe_id").references((): AnySQLiteColumn => recipes.id, { onDelete: "set null" }),
    /** The original AnyList text, kept for reference after import. */
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

/** Pairs of groceries that may be the same thing, waiting for the owner to merge them or keep them apart. */
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

/** Key-value settings: the household password hash and the cookie signing secret. */
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});
