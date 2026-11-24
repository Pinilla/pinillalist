import type { RecipeChoice } from "./order.ts";
import type { Grocery, Recipe } from "./types.ts";

export interface IngredientUse {
  recipeId: number;
  recipeName: string;
  ingredientId: number;
  cookingAmount: string;
  preparation: string;
}

export interface MergedItem {
  groceryId: number;
  groceryName: string;
  uses: IngredientUse[];
}

export type SubRecipeMode = "make" | "buy" | "have";

export function defaultMode(row: { optional: boolean }): SubRecipeMode {
  return row.optional ? "have" : "make";
}

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
      }
      add(row.groceryId, row.groceryName, line);
    }
  }
  return [...items.values()];
}

export function subRecipeIds(recipes: Recipe[]): number[] {
  const ids = new Set<number>();
  for (const r of recipes) for (const row of r.ingredients) if (row.kind === "ingredient" && row.subRecipe) ids.add(row.subRecipe.id);
  return [...ids];
}
