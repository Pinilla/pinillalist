import type { Grocery, Recipe } from "./types.ts";

/** One recipe's ingredient line for a grocery, shown on the stock check card. */
export interface IngredientUse {
  recipeId: number;
  recipeName: string;
  ingredientId: number;
  cookingAmount: string;
  preparation: string;
}

/** One grocery the chosen recipes need, with every ingredient line that asks for it. */
export interface MergedItem {
  groceryId: number;
  groceryName: string;
  uses: IngredientUse[];
}

/**
 * Merges the chosen recipes' ingredients into one item per grocery, so "1 onion,
 * diced" and "1 onion" are both lines under Onion. The amounts are not added up.
 * The person reads the lines and decides how many of the product to buy.
 */
export function mergeIngredients(recipes: Recipe[], groceries: Map<number, Grocery>): MergedItem[] {
  const items = new Map<number, MergedItem>();
  for (const recipe of recipes) {
    for (const row of recipe.ingredients) {
      if (row.kind !== "ingredient") continue;
      let item = items.get(row.groceryId);
      if (!item) {
        item = { groceryId: row.groceryId, groceryName: groceries.get(row.groceryId)?.name ?? row.groceryName, uses: [] };
        items.set(row.groceryId, item);
      }
      item.uses.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        ingredientId: row.id,
        cookingAmount: row.cookingAmount,
        preparation: row.preparation,
      });
    }
  }
  return [...items.values()];
}
