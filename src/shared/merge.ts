import type { Grocery, Recipe } from "./types.ts";

/** One recipe's need for a grocery, kept so the stock check can show where an amount came from. */
export interface IngredientUse {
  recipeId: number;
  recipeName: string;
  ingredientId: number;
  cookingAmount: string;
  buyingAmount: number | null;
}

/** One grocery the chosen recipes need, with their buying amounts added up. */
export interface MergedItem {
  groceryId: number;
  groceryName: string;
  unit: string;
  /** Sum of the known buying amounts. Null when no ingredient has one yet. */
  total: number | null;
  uses: IngredientUse[];
  /** Recipe names in the order they were chosen, each once. */
  recipeNames: string[];
}

/**
 * Merges the chosen recipes' ingredients into one item per grocery. Preparations
 * are ignored, so "1 onion, diced" and "1 onion" both add to Onion.
 */
export function mergeIngredients(recipes: Recipe[], groceries: Map<number, Grocery>): MergedItem[] {
  const items = new Map<number, MergedItem>();
  for (const recipe of recipes) {
    for (const row of recipe.ingredients) {
      if (row.kind !== "ingredient") continue;
      let item = items.get(row.groceryId);
      if (!item) {
        const grocery = groceries.get(row.groceryId);
        item = {
          groceryId: row.groceryId,
          groceryName: grocery?.name ?? row.groceryName,
          unit: grocery?.unit ?? "",
          total: null,
          uses: [],
          recipeNames: [],
        };
        items.set(row.groceryId, item);
      }
      item.uses.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        ingredientId: row.id,
        cookingAmount: row.cookingAmount,
        buyingAmount: row.buyingAmount,
      });
      if (row.buyingAmount !== null) item.total = (item.total ?? 0) + row.buyingAmount;
      if (!item.recipeNames.includes(recipe.name)) item.recipeNames.push(recipe.name);
    }
  }
  return [...items.values()];
}

/** Ingredients of a merged item that still need a buying amount. */
export function missingAmounts(item: MergedItem): IngredientUse[] {
  return item.uses.filter((u) => u.buyingAmount === null);
}
