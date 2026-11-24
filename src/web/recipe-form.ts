import { toggleCollection } from "../shared/filters.ts";
import type { IngredientRow, Recipe } from "../shared/types.ts";

export type FormRow =
  | { key: number; kind: "heading"; text: string }
  | {
      key: number;
      kind: "ingredient";
      groceryName: string;
      cookingAmount: string;
      preparation: string;
      optional: boolean;
      subRecipeId: string;
    };

export type IngredientFields = Partial<Omit<Extract<FormRow, { kind: "ingredient" }>, "key" | "kind">>;

export interface RecipeForm {
  name: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  steps: string;
  note: string;
  sourceName: string;
  sourceUrl: string;
  rating: number | null;
  collectionIds: number[];
  rows: FormRow[];
}

type TextField = "name" | "servings" | "prepMinutes" | "cookMinutes" | "steps" | "note" | "sourceName" | "sourceUrl";

export type FormAction =
  | { type: "setText"; field: TextField; value: string }
  | { type: "setRating"; rating: number | null }
  | { type: "toggleCollection"; collectionId: number }
  | { type: "editIngredient"; key: number; fields: IngredientFields }
  | { type: "editHeading"; key: number; text: string }
  | { type: "moveRow"; index: number; by: number }
  | { type: "removeRow"; key: number }
  | { type: "addIngredient" }
  | { type: "addHeading" };

export interface RecipeBody {
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
  ingredients: (
    | { kind: "heading"; text: string }
    | { kind: "ingredient"; groceryName: string; cookingAmount: string; preparation: string; optional: boolean; subRecipeId: number | null }
  )[];
}

export function blankForm(): RecipeForm {
  return {
    name: "",
    servings: "",
    prepMinutes: "",
    cookMinutes: "",
    steps: "",
    note: "",
    sourceName: "",
    sourceUrl: "",
    rating: null,
    collectionIds: [],
    rows: [blankIngredient()],
  };
}

export function formFromRecipe(recipe: Recipe): RecipeForm {
  return {
    name: recipe.name,
    servings: recipe.servings,
    prepMinutes: minutesText(recipe.prepTime),
    cookMinutes: minutesText(recipe.cookTime),
    steps: recipe.steps.join("\n\n"),
    note: recipe.note,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    rating: recipe.rating,
    collectionIds: recipe.collectionIds,
    rows: recipe.ingredients.length ? recipe.ingredients.map(rowFromIngredient) : [blankIngredient()],
  };
}

export function updateForm(form: RecipeForm, action: FormAction): RecipeForm {
  switch (action.type) {
    case "setText":
      return { ...form, [action.field]: action.value };
    case "setRating":
      return { ...form, rating: action.rating };
    case "toggleCollection":
      return { ...form, collectionIds: toggleCollection(form.collectionIds, action.collectionId) };
    case "editIngredient":
      return { ...form, rows: form.rows.map((r) => (r.key === action.key && r.kind === "ingredient" ? { ...r, ...action.fields } : r)) };
    case "editHeading":
      return { ...form, rows: form.rows.map((r) => (r.key === action.key && r.kind === "heading" ? { ...r, text: action.text } : r)) };
    case "moveRow":
      return { ...form, rows: moveRow(form.rows, action.index, action.by) };
    case "removeRow":
      return { ...form, rows: form.rows.filter((r) => r.key !== action.key) };
    case "addIngredient":
      return { ...form, rows: [...form.rows, blankIngredient()] };
    case "addHeading":
      return { ...form, rows: [...form.rows, { key: nextKey++, kind: "heading", text: "" }] };
  }
}

export function formToBody(form: RecipeForm): RecipeBody {
  return {
    name: form.name,
    servings: form.servings,
    prepTime: secondsFromMinutes(form.prepMinutes),
    cookTime: secondsFromMinutes(form.cookMinutes),
    steps: splitSteps(form.steps),
    note: form.note,
    sourceName: form.sourceName,
    sourceUrl: form.sourceUrl,
    rating: form.rating,
    collectionIds: form.collectionIds,
    ingredients: form.rows.map(ingredientFromRow),
  };
}

let nextKey = 1;

function blankIngredient(): FormRow {
  return { key: nextKey++, kind: "ingredient", groceryName: "", cookingAmount: "", preparation: "", optional: false, subRecipeId: "" };
}

function rowFromIngredient(row: IngredientRow): FormRow {
  if (row.kind === "heading") return { key: nextKey++, kind: "heading", text: row.text };
  return {
    key: nextKey++,
    kind: "ingredient",
    groceryName: row.groceryName,
    cookingAmount: row.cookingAmount,
    preparation: row.preparation,
    optional: row.optional,
    subRecipeId: row.subRecipe ? String(row.subRecipe.id) : "",
  };
}

function ingredientFromRow(row: FormRow): RecipeBody["ingredients"][number] {
  if (row.kind === "heading") return { kind: "heading", text: row.text };
  return {
    kind: "ingredient",
    groceryName: row.groceryName,
    cookingAmount: row.cookingAmount,
    preparation: row.preparation,
    optional: row.optional,
    subRecipeId: row.subRecipeId ? Number(row.subRecipeId) : null,
  };
}

function moveRow(rows: FormRow[], index: number, by: number): FormRow[] {
  const next = [...rows];
  const [row] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(next.length, index + by)), 0, row!);
  return next;
}

function minutesText(seconds: number | null): string {
  return seconds ? String(Math.round(seconds / 60)) : "";
}

function secondsFromMinutes(text: string): number | null {
  return text.trim() && Number(text) > 0 ? Math.round(Number(text) * 60) : null;
}

function splitSteps(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
