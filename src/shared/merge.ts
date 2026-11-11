import type { RecipeChoice } from "./order.ts";
import type { Grocery, Recipe } from "./types.ts";

/** One recipe's ingredient line for a grocery, shown on the stock check card. */
export interface IngredientUse {
  recipeId: number;
  /** The recipe's name. A line from a recipe made for another one reads "Hot Honey Cholula (in Burrito Bowls)". */
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

/** What to do about an ingredient made from another recipe. */
export type SubRecipeMode = "make" | "buy" | "have";

/** Made by default, unless the line is optional, which starts out skipped like any optional ingredient. */
export function defaultMode(row: { optional: boolean }): SubRecipeMode {
  return row.optional ? "have" : "make";
}

/**
 * Merges the chosen recipes' ingredients into one item per grocery, so "1 onion,
 * diced" and "1 onion" are both lines under Onion. The amounts are not added up.
 *
 * Each recipe's choices decide the extras. Optional ingredients come in only
 * when picked. An ingredient made from another recipe is made by default
 * (skipped by default if it's also optional),
 * which brings in that recipe's own ingredients. "buy" brings in its grocery
 * instead, and "have" leaves it out. Only one level is expanded: inside the
 * inner recipe, a line made from yet another recipe counts as its grocery, and
 * the inner recipe's optional lines are left out.
 */
export function mergeIngredients(
  recipes: Recipe[],
  groceries: Map<number, Grocery>,
  choices: Record<string, RecipeChoice> = {},
  subRecipes: Map<number, Recipe> = new Map(),
): MergedItem[] {
  const items = new Map<number, MergedItem>();
  const add = (groceryId: number, groceryName: string, use: IngredientUse) => {
    let item = items.get(groceryId);
    if (!item) {
      item = { groceryId, groceryName: groceries.get(groceryId)?.name ?? groceryName, uses: [] };
      items.set(groceryId, item);
    }
    item.uses.push(use);
  };

  for (const recipe of recipes) {
    const choice = choices[recipe.id];
    for (const row of recipe.ingredients) {
      if (row.kind !== "ingredient") continue;
      if (row.optional && !row.subRecipe && !choice?.optional.includes(row.id)) continue;
      const line = { recipeId: recipe.id, recipeName: recipe.name, ingredientId: row.id, cookingAmount: row.cookingAmount, preparation: row.preparation };
      if (row.subRecipe) {
        const mode = choice?.subRecipes[row.id] ?? defaultMode(row);
        if (mode === "have") continue;
        const inner = subRecipes.get(row.subRecipe.id);
        if (mode === "make" && inner) {
          for (const innerRow of inner.ingredients) {
            if (innerRow.kind !== "ingredient" || innerRow.optional) continue;
            add(innerRow.groceryId, innerRow.groceryName, {
              recipeId: inner.id,
              recipeName: `${inner.name} (in ${recipe.name})`,
              ingredientId: innerRow.id,
              cookingAmount: innerRow.cookingAmount,
              preparation: innerRow.preparation,
            });
          }
          continue;
        }
        // "buy", or the inner recipe was deleted: buy the grocery.
      }
      add(row.groceryId, row.groceryName, line);
    }
  }
  return [...items.values()];
}

/** The ids of the recipes that the picked recipes' ingredients are made from, which the stock check also needs. */
export function subRecipeIds(recipes: Recipe[]): number[] {
  const ids = new Set<number>();
  for (const r of recipes) for (const row of r.ingredients) if (row.kind === "ingredient" && row.subRecipe) ids.add(row.subRecipe.id);
  return [...ids];
}
