import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Db } from "../../src/server/db/index.ts";
import {
  collections,
  groceries,
  ingredients,
  recipeCollections,
  recipes,
} from "../../src/server/db/schema.ts";
import {
  addListItem,
  addMergeSuggestion,
  createList,
  findOrCreateGrocery,
} from "../../src/server/repo.ts";
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
  photos: number;
  missingPhotos: string[];
  essentials: number;
  suggestions: number;
  skippedLists: string[];
}

const ESSENTIALS = "Weekly Essentials";

export function importAnyList(db: Db, data: AnyListExport, opts: PhotoFolders): ImportReport {
  if (db.select({ id: recipes.id }).from(recipes).get()) {
    throw new Error(
      "The database already has recipes. The AnyList import only runs once, on an empty database.",
    );
  }
  const source = data.recipeDataResponse;
  const report = emptyReport();
  const parsed = parseAll(source.recipes);
  const unitFor = unitChooser(parsed);
  mkdirSync(opts.photosTo, { recursive: true });

  db.transaction((tx) => {
    const collectionsOf = importCollections(tx, source.recipeCollections, report);
    for (const r of source.recipes) {
      const recipeId = insertRecipe(
        tx,
        r,
        copyPhoto(r, opts, report),
        collectionsOf.get(r.identifier) ?? [],
      );
      report.recipes++;
      insertIngredients(
        tx,
        recipeId,
        r.ingredients ?? [],
        parsed.get(r.identifier)!,
        unitFor,
        report,
      );
    }
    importEssentials(tx, data.shoppingListsResponse.newLists, report);
    suggestMerges(tx, report);
  });

  return report;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PhotoFolders = { photosFrom: string; photosTo: string };
type Parsed = ReturnType<typeof parseIngredient> | null;
type AnyListCollection = AnyListExport["recipeDataResponse"]["recipeCollections"][number];
type AnyListList = AnyListExport["shoppingListsResponse"]["newLists"][number];

function emptyReport(): ImportReport {
  return {
    recipes: 0,
    collections: 0,
    groceries: 0,
    ingredients: 0,
    photos: 0,
    missingPhotos: [],
    essentials: 0,
    suggestions: 0,
    skippedLists: [],
  };
}

function parseAll(recipeList: AnyListRecipeJson[]): Map<string, Parsed[]> {
  return new Map(
    recipeList.map((recipe) => [
      recipe.identifier,
      (recipe.ingredients ?? []).map((ing) =>
        ing.isHeading
          ? null
          : parseIngredient({
              name: ing.name ?? ing.rawIngredient ?? "",
              quantity: ing.quantity,
              note: ing.note,
            }),
      ),
    ]),
  );
}

function unitChooser(parsed: Map<string, Parsed[]>): (key: string) => string {
  const votes = countUnitVotes(parsed);
  return (key) => {
    const forKey = votes.get(key);
    if (!forKey) {
      return "";
    }
    return [...forKey].sort(
      (a, b) => b[1] - a[1] || (a[0] === "" ? -1 : b[0] === "" ? 1 : 0),
    )[0]![0];
  };
}

function countUnitVotes(parsed: Map<string, Parsed[]>): Map<string, Map<string, number>> {
  const votes = new Map<string, Map<string, number>>();
  for (const rows of parsed.values()) {
    for (const row of rows) {
      const counted = row?.groceryName ? countedAmount(row.cookingAmount) : null;
      if (!counted) {
        continue;
      }
      const key = groceryKey(row!.groceryName);
      const forKey = votes.get(key) ?? new Map<string, number>();
      forKey.set(counted.unit, (forKey.get(counted.unit) ?? 0) + 1);
      votes.set(key, forKey);
    }
  }
  return votes;
}

function importCollections(
  tx: Tx,
  source: AnyListCollection[],
  report: ImportReport,
): Map<string, number[]> {
  const ids = new Map<string, number>();
  source.forEach((c, position) => {
    ids.set(
      c.identifier,
      tx.insert(collections).values({ name: c.name, position }).returning().get().id,
    );
    report.collections++;
  });
  const byRecipe = new Map<string, number[]>();
  for (const c of source) {
    for (const recipeId of c.recipeIds ?? []) {
      byRecipe.set(recipeId, [...(byRecipe.get(recipeId) ?? []), ids.get(c.identifier)!]);
    }
  }
  return byRecipe;
}

function copyPhoto(r: AnyListRecipeJson, opts: PhotoFolders, report: ImportReport): string | null {
  if (!r.photoIds?.length) {
    return null;
  }
  const file = `${r.identifier}-0.jpg`;
  const from = path.join(opts.photosFrom, file);
  if (!existsSync(from)) {
    report.missingPhotos.push(r.name);
    return null;
  }
  copyFileSync(from, path.join(opts.photosTo, file));
  report.photos++;
  return file;
}

function insertRecipe(
  tx: Tx,
  r: AnyListRecipeJson,
  photo: string | null,
  collectionIds: number[],
): number {
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
  for (const collectionId of new Set(collectionIds)) {
    tx.insert(recipeCollections).values({ recipeId: row.id, collectionId }).run();
  }
  return row.id;
}

function insertIngredients(
  tx: Tx,
  recipeId: number,
  source: AnyListIngredientJson[],
  parsed: Parsed[],
  unitFor: (key: string) => string,
  report: ImportReport,
) {
  source.forEach((ing, position) => {
    const p = parsed[position];
    if (ing.isHeading || !p) {
      tx.insert(ingredients)
        .values({
          recipeId,
          position,
          kind: "heading",
          heading: (ing.name ?? "").trim(),
          raw: ing.name ?? "",
        })
        .run();
      return;
    }
    if (!p.groceryName) {
      return;
    }
    const { grocery, created } = findOrCreateGrocery(
      tx,
      p.groceryName,
      unitFor(groceryKey(p.groceryName)),
    );
    if (created) {
      report.groceries++;
    }
    report.ingredients++;
    tx.insert(ingredients)
      .values({
        recipeId,
        position,
        kind: "ingredient",
        groceryId: grocery.id,
        cookingAmount: p.cookingAmount,
        preparation: p.preparation,
        raw: ing.rawIngredient ?? ing.name ?? "",
      })
      .run();
  });
}

function importEssentials(tx: Tx, source: AnyListList[], report: ImportReport) {
  for (const list of source) {
    if (list.name !== ESSENTIALS) {
      report.skippedLists.push(`${list.name} (${list.items?.length ?? 0} items)`);
      continue;
    }
    const essentials = createList(tx, ESSENTIALS, "essentials");
    for (const item of list.items ?? []) {
      if (findOrCreateGrocery(tx, item.name).created) {
        report.groceries++;
      }
      addListItem(tx, essentials.id, { groceryName: item.name, details: item.details ?? "" });
      report.essentials++;
    }
  }
}

function suggestMerges(tx: Tx, report: ImportReport) {
  const all = tx.select({ id: groceries.id, name: groceries.name }).from(groceries).all();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (!isNearDuplicate(all[i]!.name, all[j]!.name)) {
        continue;
      }
      const [a, b] =
        all[i]!.name.length <= all[j]!.name.length ? [all[i]!, all[j]!] : [all[j]!, all[i]!];
      addMergeSuggestion(tx, a.id, b.id);
      report.suggestions++;
    }
  }
}
