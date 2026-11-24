import type { RecipeChoice } from "./order.ts";
import type { Grocery, IngredientRow, Recipe } from "./types.ts";

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
  for (const recipe of recipes) {
    for (const need of recipeNeeds(recipe, choices[recipe.id], subRecipes)) {
      const item = items.get(need.groceryId) ?? { groceryId: need.groceryId, groceryName: groceries.get(need.groceryId)?.name ?? need.groceryName, uses: [] };
      item.uses.push(need.use);
      items.set(need.groceryId, item);
    }
  }
  return [...items.values()];
}

type IngredientLine = Extract<IngredientRow, { kind: "ingredient" }>;
type Need = { groceryId: number; groceryName: string; use: IngredientUse };

function recipeNeeds(recipe: Recipe, choice: RecipeChoice | undefined, subRecipes: Map<number, Recipe>): Need[] {
  return ingredientLines(recipe)
    .filter((row) => !row.optional || row.subRecipe || choice?.optional.includes(row.id))
    .flatMap((row) => lineNeeds(recipe, row, choice, subRecipes));
}

function lineNeeds(recipe: Recipe, row: IngredientLine, choice: RecipeChoice | undefined, subRecipes: Map<number, Recipe>): Need[] {
  if (!row.subRecipe) return [need(recipe, recipe.name, row)];
  const mode = choice?.subRecipes[row.id] ?? defaultMode(row);
  if (mode === "have") return [];
  const inner = subRecipes.get(row.subRecipe.id);
  if (mode === "make" && inner) return madeRecipeNeeds(inner, recipe);
  return [need(recipe, recipe.name, row)];
}

function madeRecipeNeeds(inner: Recipe, outer: Recipe): Need[] {
  return ingredientLines(inner)
    .filter((row) => !row.optional)
    .map((row) => need(inner, `${inner.name} (in ${outer.name})`, row));
}

function need(recipe: Recipe, recipeName: string, row: IngredientLine): Need {
  return {
    groceryId: row.groceryId,
    groceryName: row.groceryName,
    use: { recipeId: recipe.id, recipeName, ingredientId: row.id, cookingAmount: row.cookingAmount, preparation: row.preparation },
  };
}

function ingredientLines(recipe: Recipe): IngredientLine[] {
  return recipe.ingredients.flatMap((row) => (row.kind === "ingredient" ? [row] : []));
}

export function subRecipeIds(recipes: Recipe[]): number[] {
  const ids = new Set<number>();
  for (const r of recipes) for (const row of r.ingredients) if (row.kind === "ingredient" && row.subRecipe) ids.add(row.subRecipe.id);
  return [...ids];
}
