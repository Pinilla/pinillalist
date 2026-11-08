import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Db } from "../../src/server/db/index.ts";
import { collections, groceries, ingredients, recipeCollections, recipes } from "../../src/server/db/schema.ts";
import { addListItem, addMergeSuggestion, createList, findOrCreateGrocery } from "../../src/server/repo.ts";
import { groceryKey, isNearDuplicate } from "../../src/shared/names.ts";
import { countedAmount, parseIngredient } from "./parse.ts";

interface AnyListIngredientJson {
  name?: string;
  quantity?: string;
  note?: string;
  rawIngredient?: string;
  isHeading?: boolean;
}

interface AnyListRecipeJson {
  identifier: string;
  name: string;
  ingredients?: AnyListIngredientJson[];
  preparationSteps?: string[];
  photoIds?: string[];
  sourceName?: string;
  sourceUrl?: string;
  note?: string;
  servings?: string;
  prepTime?: number;
  cookTime?: number;
  rating?: number;
}

interface AnyListExport {
  recipeDataResponse: {
    recipes: AnyListRecipeJson[];
    recipeCollections: { identifier: string; name: string; recipeIds?: string[] }[];
  };
  shoppingListsResponse: {
    newLists: { name: string; items?: { name: string; details?: string }[] }[];
  };
}

export interface ImportReport {
  recipes: number;
  collections: number;
  groceries: number;
  ingredients: number;
  withBuyingAmount: number;
  photos: number;
  missingPhotos: string[];
  essentials: number;
  suggestions: number;
  skippedLists: string[];
}

/**
 * Only the Essentials list comes over. "Quick Things" holds personal to-dos,
 * and the owner chose on 2026-11-08 to leave out "Store" and the empty "My Grocery List".
 */
const ESSENTIALS = "Weekly Essentials";

/**
 * Loads the household's AnyList export into an empty database: recipes with
 * their collections and photos, the catalog of groceries their ingredients
 * point at, and the Essentials list. Near-duplicate groceries become merge
 * suggestions for the owner to review in the app.
 */
export function importAnyList(
  db: Db,
  data: AnyListExport,
  opts: { photosFrom: string; photosTo: string },
): ImportReport {
  if (db.select({ id: recipes.id }).from(recipes).get()) {
    throw new Error("The database already has recipes. The AnyList import only runs once, on an empty database.");
  }

  const source = data.recipeDataResponse;
  const report: ImportReport = {
    recipes: 0, collections: 0, groceries: 0, ingredients: 0, withBuyingAmount: 0,
    photos: 0, missingPhotos: [], essentials: 0, suggestions: 0, skippedLists: [],
  };

  // Parse every ingredient first, so each grocery's unit can come from all its uses.
  const parsed = new Map<string, ReturnType<typeof parseIngredient>[]>();
  const unitVotes = new Map<string, Map<string, number>>();
  for (const recipe of source.recipes) {
    const rows = (recipe.ingredients ?? []).map((ing) =>
      ing.isHeading ? null : parseIngredient({ name: ing.name ?? ing.rawIngredient ?? "", quantity: ing.quantity, note: ing.note }),
    );
    parsed.set(recipe.identifier, rows as ReturnType<typeof parseIngredient>[]);
    for (const row of rows) {
      if (!row?.groceryName) continue;
      const counted = countedAmount(row.cookingAmount);
      if (!counted) continue;
      const key = groceryKey(row.groceryName);
      const votes = unitVotes.get(key) ?? new Map<string, number>();
      votes.set(counted.unit, (votes.get(counted.unit) ?? 0) + 1);
      unitVotes.set(key, votes);
    }
  }
  const unitFor = (key: string): string => {
    const votes = unitVotes.get(key);
    if (!votes) return "";
    // Most votes wins. A tie goes to counting by name.
    return [...votes].sort((a, b) => b[1] - a[1] || (a[0] === "" ? -1 : b[0] === "" ? 1 : 0))[0]![0];
  };

  mkdirSync(opts.photosTo, { recursive: true });

  db.transaction((tx) => {
    const collectionIds = new Map<string, number>();
    source.recipeCollections.forEach((c, position) => {
      const row = tx.insert(collections).values({ name: c.name, position }).returning().get();
      collectionIds.set(c.identifier, row.id);
      report.collections++;
    });
    const recipeToCollections = new Map<string, number[]>();
    for (const c of source.recipeCollections) {
      for (const rid of c.recipeIds ?? []) {
        recipeToCollections.set(rid, [...(recipeToCollections.get(rid) ?? []), collectionIds.get(c.identifier)!]);
      }
    }

    for (const r of source.recipes) {
      let photo: string | null = null;
      // The export saved each recipe's first photo as <recipe id>-0.jpg.
      if (r.photoIds?.length) {
        const file = `${r.identifier}-0.jpg`;
        const from = path.join(opts.photosFrom, file);
        if (existsSync(from)) {
          copyFileSync(from, path.join(opts.photosTo, file));
          photo = file;
          report.photos++;
        } else {
          report.missingPhotos.push(r.name);
        }
      }

      const row = tx
        .insert(recipes)
        .values({
          name: r.name.trim(),
          servings: (r.servings ?? "").trim(),
          prepTime: r.prepTime || null,
          cookTime: r.cookTime || null,
          steps: (r.preparationSteps ?? []).map((s) => s.trim()).filter(Boolean),
          note: (r.note ?? "").trim(),
          sourceName: (r.sourceName ?? "").trim(),
          sourceUrl: (r.sourceUrl ?? "").trim(),
          rating: r.rating || null,
          photo,
        })
        .returning()
        .get();
      report.recipes++;
      for (const collectionId of new Set(recipeToCollections.get(r.identifier) ?? [])) {
        tx.insert(recipeCollections).values({ recipeId: row.id, collectionId }).run();
      }

      const rows = parsed.get(r.identifier)!;
      (r.ingredients ?? []).forEach((ing, position) => {
        const p = rows[position];
        if (ing.isHeading || !p) {
          tx.insert(ingredients).values({ recipeId: row.id, position, kind: "heading", heading: (ing.name ?? "").trim(), raw: ing.name ?? "" }).run();
          return;
        }
        if (!p.groceryName) return;
        const key = groceryKey(p.groceryName);
        const { grocery, created } = findOrCreateGrocery(tx, p.groceryName, unitFor(key));
        if (created) report.groceries++;
        const counted = countedAmount(p.cookingAmount);
        const buyingAmount = counted && counted.unit === grocery.unit ? counted.amount : null;
        if (buyingAmount !== null) report.withBuyingAmount++;
        report.ingredients++;
        tx.insert(ingredients)
          .values({
            recipeId: row.id,
            position,
            kind: "ingredient",
            groceryId: grocery.id,
            cookingAmount: p.cookingAmount,
            preparation: p.preparation,
            buyingAmount,
            raw: ing.rawIngredient ?? ing.name ?? "",
          })
          .run();
      });
    }

    for (const list of data.shoppingListsResponse.newLists) {
      if (list.name !== ESSENTIALS) {
        report.skippedLists.push(`${list.name} (${list.items?.length ?? 0} items)`);
        continue;
      }
      const essentials = createList(tx, ESSENTIALS, "essentials");
      for (const item of list.items ?? []) {
        const { created } = findOrCreateGrocery(tx, item.name);
        if (created) report.groceries++;
        addListItem(tx, essentials.id, { groceryName: item.name, details: item.details ?? "" });
        report.essentials++;
      }
    }

    const all = tx.select({ id: groceries.id, name: groceries.name }).from(groceries).all();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (isNearDuplicate(all[i]!.name, all[j]!.name)) {
          // Put the shorter name first: it is usually the one to keep.
          const [a, b] = all[i]!.name.length <= all[j]!.name.length ? [all[i]!, all[j]!] : [all[j]!, all[i]!];
          addMergeSuggestion(tx, a.id, b.id);
          report.suggestions++;
        }
      }
    }
  });

  return report;
}
