import { and, asc, eq, inArray, or } from "drizzle-orm";
import { groceryKey } from "../shared/names.ts";
import type {
  Collection,
  Grocery,
  GroceryList,
  IngredientRow,
  Product,
  Recipe,
  RecipeSummary,
} from "../shared/types.ts";
import type { Db } from "./db/index.ts";
import {
  collections,
  groceries,
  ingredients,
  listItems,
  lists,
  mergeSuggestions,
  products,
  recipeCollections,
  recipes,
  settings,
} from "./db/schema.ts";

export class NotFound extends Error {}
export class Conflict extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

// Settings

export function getSetting(db: Conn, key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

export function setSetting(db: Conn, key: string, value: string) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

// Groceries

function toGrocery(row: { g: typeof groceries.$inferSelect; p: typeof products.$inferSelect | null }): Grocery {
  const { g, p } = row;
  const product: Product | null = p
    ? { store: p.store, storeId: p.storeId, name: p.name, size: p.size, imageUrl: p.imageUrl, soldBy: p.soldBy }
    : null;
  return { id: g.id, name: g.name, unit: g.unit, product };
}

export function listGroceries(db: Conn): Grocery[] {
  return db
    .select({ g: groceries, p: products })
    .from(groceries)
    .leftJoin(products, eq(products.groceryId, groceries.id))
    .orderBy(asc(groceries.nameKey))
    .all()
    .map(toGrocery);
}

export function getGrocery(db: Conn, id: number): Grocery {
  const row = db
    .select({ g: groceries, p: products })
    .from(groceries)
    .leftJoin(products, eq(products.groceryId, groceries.id))
    .where(eq(groceries.id, id))
    .get();
  if (!row) throw new NotFound(`No grocery ${id}`);
  return toGrocery(row);
}

/** Finds the grocery with this name, ignoring case and plurals, or adds it to the catalog. */
export function findOrCreateGrocery(db: Conn, name: string, unit = ""): { grocery: Grocery; created: boolean } {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) throw new Conflict("A grocery needs a name.");
  const key = groceryKey(clean);
  const existing = db.select().from(groceries).where(eq(groceries.nameKey, key)).get();
  if (existing) return { grocery: getGrocery(db, existing.id), created: false };
  const row = db.insert(groceries).values({ name: clean, nameKey: key, unit: unit.trim() }).returning().get();
  return { grocery: getGrocery(db, row.id), created: true };
}

export function updateGrocery(db: Conn, id: number, patch: { name?: string; unit?: string }): Grocery {
  getGrocery(db, id);
  const set: Partial<typeof groceries.$inferInsert> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.replace(/\s+/g, " ").trim();
    if (!clean) throw new Conflict("A grocery needs a name.");
    const key = groceryKey(clean);
    const other = db.select().from(groceries).where(eq(groceries.nameKey, key)).get();
    if (other && other.id !== id) throw new Conflict(`"${other.name}" is already in the catalog. Merge them instead.`);
    set.name = clean;
    set.nameKey = key;
  }
  if (patch.unit !== undefined) set.unit = patch.unit.trim();
  if (Object.keys(set).length) db.update(groceries).set(set).where(eq(groceries.id, id)).run();
  return getGrocery(db, id);
}

export function setProduct(db: Conn, groceryId: number, product: Product): Grocery {
  getGrocery(db, groceryId);
  db.insert(products)
    .values({ groceryId, ...product })
    .onConflictDoUpdate({ target: products.groceryId, set: product })
    .run();
  return getGrocery(db, groceryId);
}

export function removeProduct(db: Conn, groceryId: number): Grocery {
  db.delete(products).where(eq(products.groceryId, groceryId)).run();
  return getGrocery(db, groceryId);
}

export function deleteGrocery(db: Conn, id: number) {
  getGrocery(db, id);
  const used =
    db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.groceryId, id)).get() ??
    db.select({ id: listItems.id }).from(listItems).where(eq(listItems.groceryId, id)).get();
  if (used) throw new Conflict("This grocery is used by a recipe or a list. Merge it into another grocery instead.");
  db.delete(groceries).where(eq(groceries.id, id)).run();
}

/**
 * Merges one grocery into another: its ingredients and list items move over,
 * its product moves over if the target has none, and it leaves the catalog.
 */
export function mergeGrocery(db: Db, fromId: number, intoId: number): Grocery {
  if (fromId === intoId) throw new Conflict("Pick a different grocery to merge into.");
  return db.transaction((tx) => {
    const from = getGrocery(tx, fromId);
    const into = getGrocery(tx, intoId);
    tx.update(ingredients).set({ groceryId: intoId }).where(eq(ingredients.groceryId, fromId)).run();

    // A list keeps one item per grocery, so items on the same list are combined.
    const moving = tx.select().from(listItems).where(eq(listItems.groceryId, fromId)).all();
    for (const item of moving) {
      const twin = tx
        .select()
        .from(listItems)
        .where(and(eq(listItems.listId, item.listId), eq(listItems.groceryId, intoId)))
        .get();
      if (twin) {
        const amount = twin.amount === null && item.amount === null ? null : (twin.amount ?? 0) + (item.amount ?? 0);
        const details = [twin.details, item.details].filter(Boolean).join("; ");
        tx.update(listItems).set({ amount, details, done: twin.done && item.done }).where(eq(listItems.id, twin.id)).run();
        tx.delete(listItems).where(eq(listItems.id, item.id)).run();
      } else {
        tx.update(listItems).set({ groceryId: intoId }).where(eq(listItems.id, item.id)).run();
      }
    }

    if (!into.product && from.product) setProduct(tx, intoId, from.product);
    if (!into.unit && from.unit) tx.update(groceries).set({ unit: from.unit }).where(eq(groceries.id, intoId)).run();
    tx.delete(groceries).where(eq(groceries.id, fromId)).run();
    return getGrocery(tx, intoId);
  });
}

export function listMergeSuggestions(db: Conn) {
  const rows = db.select().from(mergeSuggestions).where(eq(mergeSuggestions.status, "pending")).all();
  const byId = new Map(listGroceries(db).map((g) => [g.id, g]));
  return rows.flatMap((r) => {
    const a = byId.get(r.groceryA);
    const b = byId.get(r.groceryB);
    return a && b ? [{ id: r.id, a, b }] : [];
  });
}

export function keepApart(db: Conn, suggestionId: number) {
  const done = db
    .update(mergeSuggestions)
    .set({ status: "kept" })
    .where(eq(mergeSuggestions.id, suggestionId))
    .returning()
    .get();
  if (!done) throw new NotFound(`No suggestion ${suggestionId}`);
}

export function addMergeSuggestion(db: Conn, a: number, b: number) {
  const existing = db
    .select()
    .from(mergeSuggestions)
    .where(
      or(
        and(eq(mergeSuggestions.groceryA, a), eq(mergeSuggestions.groceryB, b)),
        and(eq(mergeSuggestions.groceryA, b), eq(mergeSuggestions.groceryB, a)),
      ),
    )
    .get();
  if (!existing) db.insert(mergeSuggestions).values({ groceryA: a, groceryB: b }).run();
}

/** How many recipes and lists use each grocery, for the catalog screen. */
export function groceryUsage(db: Conn): Record<number, { recipes: number; lists: number }> {
  const usage: Record<number, { recipes: number; lists: number }> = {};
  const seen = new Set<string>();
  for (const row of db.select({ g: ingredients.groceryId, r: ingredients.recipeId }).from(ingredients).all()) {
    if (row.g === null || seen.has(`${row.g}:${row.r}`)) continue;
    seen.add(`${row.g}:${row.r}`);
    (usage[row.g] ??= { recipes: 0, lists: 0 }).recipes++;
  }
  for (const row of db.select({ g: listItems.groceryId }).from(listItems).all()) {
    (usage[row.g] ??= { recipes: 0, lists: 0 }).lists++;
  }
  return usage;
}

// Collections and recipes

export function listCollections(db: Conn): Collection[] {
  return db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .orderBy(asc(collections.position), asc(collections.id))
    .all();
}

export function createCollection(db: Conn, name: string): Collection {
  const clean = name.trim();
  if (!clean) throw new Conflict("A collection needs a name.");
  const position = listCollections(db).length;
  return db.insert(collections).values({ name: clean, position }).returning({ id: collections.id, name: collections.name }).get();
}

function collectionIdsByRecipe(db: Conn, recipeIds?: number[]): Map<number, number[]> {
  const q = db.select().from(recipeCollections);
  const rows = recipeIds ? q.where(inArray(recipeCollections.recipeId, recipeIds)).all() : q.all();
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.recipeId, [...(map.get(r.recipeId) ?? []), r.collectionId]);
  return map;
}

export function listRecipes(db: Conn): RecipeSummary[] {
  const cols = collectionIdsByRecipe(db);
  return db
    .select({ id: recipes.id, name: recipes.name, photo: recipes.photo })
    .from(recipes)
    .orderBy(asc(recipes.name))
    .all()
    .map((r) => ({ ...r, collectionIds: cols.get(r.id) ?? [] }));
}

export function getRecipes(db: Conn, ids: number[]): Recipe[] {
  if (!ids.length) return [];
  const rows = db.select().from(recipes).where(inArray(recipes.id, ids)).all();
  const cols = collectionIdsByRecipe(db, ids);
  const ings = db
    .select({ i: ingredients, name: groceries.name })
    .from(ingredients)
    .leftJoin(groceries, eq(groceries.id, ingredients.groceryId))
    .where(inArray(ingredients.recipeId, ids))
    .orderBy(asc(ingredients.recipeId), asc(ingredients.position))
    .all();
  const byRecipe = new Map<number, IngredientRow[]>();
  for (const { i, name } of ings) {
    const row: IngredientRow =
      i.kind === "heading" || i.groceryId === null
        ? { kind: "heading", id: i.id, text: i.heading }
        : {
            kind: "ingredient",
            id: i.id,
            groceryId: i.groceryId,
            groceryName: name ?? "",
            cookingAmount: i.cookingAmount,
            preparation: i.preparation,
            buyingAmount: i.buyingAmount,
          };
    byRecipe.set(i.recipeId, [...(byRecipe.get(i.recipeId) ?? []), row]);
  }
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        photo: r.photo,
        collectionIds: cols.get(r.id) ?? [],
        servings: r.servings,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        steps: r.steps,
        note: r.note,
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        rating: r.rating,
        ingredients: byRecipe.get(r.id) ?? [],
      } satisfies Recipe,
    ]),
  );
  // Keep the order the caller asked for.
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
}

export function getRecipe(db: Conn, id: number): Recipe {
  const [recipe] = getRecipes(db, [id]);
  if (!recipe) throw new NotFound(`No recipe ${id}`);
  return recipe;
}

export type IngredientInput =
  | { kind: "heading"; text: string }
  | { kind: "ingredient"; groceryName: string; cookingAmount: string; preparation: string; buyingAmount: number | null };

export interface RecipeInput {
  name: string;
  servings: string;
  prepTime: number | null;
  cookTime: number | null;
  steps: string[];
  note: string;
  sourceName: string;
  sourceUrl: string;
  rating: number | null;
  collectionIds: number[];
  ingredients: IngredientInput[];
}

function writeRecipeParts(tx: Tx, id: number, input: RecipeInput) {
  tx.delete(recipeCollections).where(eq(recipeCollections.recipeId, id)).run();
  const known = new Set(listCollections(tx).map((c) => c.id));
  for (const collectionId of new Set(input.collectionIds)) {
    if (known.has(collectionId)) tx.insert(recipeCollections).values({ recipeId: id, collectionId }).run();
  }
  tx.delete(ingredients).where(eq(ingredients.recipeId, id)).run();
  input.ingredients.forEach((ing, position) => {
    if (ing.kind === "heading") {
      if (ing.text.trim()) tx.insert(ingredients).values({ recipeId: id, position, kind: "heading", heading: ing.text.trim() }).run();
      return;
    }
    if (!ing.groceryName.trim()) return;
    const { grocery } = findOrCreateGrocery(tx, ing.groceryName);
    tx.insert(ingredients)
      .values({
        recipeId: id,
        position,
        kind: "ingredient",
        groceryId: grocery.id,
        cookingAmount: ing.cookingAmount.trim(),
        preparation: ing.preparation.trim(),
        buyingAmount: ing.buyingAmount,
      })
      .run();
  });
}

function recipeColumns(input: RecipeInput) {
  const name = input.name.trim();
  if (!name) throw new Conflict("A recipe needs a name.");
  return {
    name,
    servings: input.servings.trim(),
    prepTime: input.prepTime,
    cookTime: input.cookTime,
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    note: input.note,
    sourceName: input.sourceName.trim(),
    sourceUrl: input.sourceUrl.trim(),
    rating: input.rating,
  };
}

export function createRecipe(db: Db, input: RecipeInput): Recipe {
  const id = db.transaction((tx) => {
    const row = tx.insert(recipes).values(recipeColumns(input)).returning({ id: recipes.id }).get();
    writeRecipeParts(tx, row.id, input);
    return row.id;
  });
  return getRecipe(db, id);
}

export function updateRecipe(db: Db, id: number, input: RecipeInput): Recipe {
  db.transaction((tx) => {
    getRecipe(tx, id);
    tx.update(recipes).set(recipeColumns(input)).where(eq(recipes.id, id)).run();
    writeRecipeParts(tx, id, input);
  });
  return getRecipe(db, id);
}

export function setRecipePhoto(db: Conn, id: number, photo: string | null): string | null {
  const old = getRecipe(db, id).photo;
  db.update(recipes).set({ photo }).where(eq(recipes.id, id)).run();
  return old;
}

export function deleteRecipe(db: Conn, id: number): string | null {
  const recipe = getRecipe(db, id);
  db.delete(recipes).where(eq(recipes.id, id)).run();
  return recipe.photo;
}

export function setBuyingAmount(db: Conn, ingredientId: number, buyingAmount: number | null) {
  const row = db
    .update(ingredients)
    .set({ buyingAmount })
    .where(and(eq(ingredients.id, ingredientId), eq(ingredients.kind, "ingredient")))
    .returning()
    .get();
  if (!row) throw new NotFound(`No ingredient ${ingredientId}`);
}

// Lists

export function listLists(db: Conn): GroceryList[] {
  const all = db.select().from(lists).orderBy(asc(lists.id)).all();
  const items = db
    .select({ i: listItems, name: groceries.name })
    .from(listItems)
    .innerJoin(groceries, eq(groceries.id, listItems.groceryId))
    .orderBy(asc(listItems.position), asc(listItems.id))
    .all();
  // Essentials first, then the default list, then the rest.
  all.sort((a, b) => Number(b.kind === "essentials") - Number(a.kind === "essentials") || Number(b.isDefault) - Number(a.isDefault) || a.id - b.id);
  return all.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    isDefault: l.isDefault,
    items: items
      .filter(({ i }) => i.listId === l.id)
      .map(({ i, name }) => ({ id: i.id, groceryId: i.groceryId, groceryName: name, amount: i.amount, details: i.details, done: i.done })),
  }));
}

export function getList(db: Conn, id: number): GroceryList {
  const list = listLists(db).find((l) => l.id === id);
  if (!list) throw new NotFound(`No list ${id}`);
  return list;
}

export function createList(db: Conn, name: string, kind: "essentials" | "grocery" = "grocery"): GroceryList {
  const clean = name.trim();
  if (!clean) throw new Conflict("A list needs a name.");
  if (kind === "essentials" && db.select().from(lists).where(eq(lists.kind, "essentials")).get()) {
    throw new Conflict("There is already an Essentials list.");
  }
  const hasDefault = db.select().from(lists).where(eq(lists.isDefault, true)).get();
  const row = db
    .insert(lists)
    .values({ name: clean, kind, isDefault: kind === "grocery" && !hasDefault })
    .returning()
    .get();
  return getList(db, row.id);
}

export function updateList(db: Db, id: number, patch: { name?: string; isDefault?: boolean }): GroceryList {
  const list = getList(db, id);
  db.transaction((tx) => {
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Conflict("A list needs a name.");
      tx.update(lists).set({ name: patch.name.trim() }).where(eq(lists.id, id)).run();
    }
    if (patch.isDefault) {
      if (list.kind === "essentials") throw new Conflict("The Essentials list can't be the default list.");
      tx.update(lists).set({ isDefault: false }).run();
      tx.update(lists).set({ isDefault: true }).where(eq(lists.id, id)).run();
    }
  });
  return getList(db, id);
}

export function deleteList(db: Conn, id: number) {
  const list = getList(db, id);
  if (list.kind === "essentials") throw new Conflict("The Essentials list can't be deleted.");
  db.delete(lists).where(eq(lists.id, id)).run();
  if (list.isDefault) {
    const next = db.select().from(lists).where(eq(lists.kind, "grocery")).orderBy(asc(lists.id)).get();
    if (next) db.update(lists).set({ isDefault: true }).where(eq(lists.id, next.id)).run();
  }
}

/** Adds a grocery to a list. If the list already has it, the amounts add up instead. */
export function addListItem(
  db: Conn,
  listId: number,
  input: { groceryId?: number; groceryName?: string; amount?: number | null; details?: string },
): GroceryList {
  db.transaction((tx) => {
    getList(tx, listId);
    const groceryId =
      input.groceryId ?? findOrCreateGrocery(tx, input.groceryName ?? "").grocery.id;
    getGrocery(tx, groceryId);
    const twin = tx
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.groceryId, groceryId)))
      .get();
    const amount = input.amount ?? null;
    if (twin) {
      const sum = twin.amount === null && amount === null ? null : (twin.amount ?? 0) + (amount ?? 0);
      tx.update(listItems).set({ amount: sum, done: false }).where(eq(listItems.id, twin.id)).run();
    } else {
      const position = tx.select().from(listItems).where(eq(listItems.listId, listId)).all().length;
      tx.insert(listItems).values({ listId, groceryId, amount, details: input.details?.trim() ?? "", position }).run();
    }
  });
  return getList(db, listId);
}

export function updateListItem(
  db: Conn,
  id: number,
  patch: { done?: boolean; amount?: number | null; details?: string },
): GroceryList {
  const item = db.select().from(listItems).where(eq(listItems.id, id)).get();
  if (!item) throw new NotFound(`No list item ${id}`);
  const list = getList(db, item.listId);
  const set: Partial<typeof listItems.$inferInsert> = {};
  if (patch.done !== undefined && list.kind !== "essentials") set.done = patch.done;
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.details !== undefined) set.details = patch.details.trim();
  if (Object.keys(set).length) db.update(listItems).set(set).where(eq(listItems.id, id)).run();
  return getList(db, item.listId);
}

export function deleteListItem(db: Conn, id: number): GroceryList {
  const item = db.select().from(listItems).where(eq(listItems.id, id)).get();
  if (!item) throw new NotFound(`No list item ${id}`);
  db.delete(listItems).where(eq(listItems.id, id)).run();
  return getList(db, item.listId);
}

export function clearDone(db: Conn, listId: number): GroceryList {
  db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.done, true))).run();
  return getList(db, listId);
}
