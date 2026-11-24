import { describe, expect, it } from "vitest";
import type { Recipe } from "../shared/types.ts";
import { blankForm, formFromRecipe, formToBody, updateForm, type FormAction, type RecipeForm } from "./recipe-form.ts";

const chili: Recipe = {
  id: 7,
  name: "Chili",
  photo: null,
  collectionIds: [2],
  hasExtras: true,
  servings: "6",
  prepTime: 900,
  cookTime: 3600,
  steps: ["Brown the beef.", "Add the beans."],
  note: "Better the next day.",
  sourceName: "Grandma",
  sourceUrl: "example.com/chili",
  rating: 4,
  ingredients: [
    { kind: "heading", id: 1, text: "For the chili" },
    { kind: "ingredient", id: 2, groceryId: 10, groceryName: "Onion", cookingAmount: "1", preparation: "diced", optional: false, subRecipe: null },
    { kind: "ingredient", id: 3, groceryId: 11, groceryName: "Hot sauce", cookingAmount: "2 tbsp", preparation: "", optional: true, subRecipe: { id: 9, name: "Hot Honey" } },
  ],
};

function apply(form: RecipeForm, actions: FormAction[]): RecipeForm {
  return actions.reduce(updateForm, form);
}

describe("the recipe form", () => {
  it("saves an unchanged recipe exactly as it was loaded", () => {
    expect(formToBody(formFromRecipe(chili))).toEqual({
      name: "Chili",
      servings: "6",
      prepTime: 900,
      cookTime: 3600,
      steps: ["Brown the beef.", "Add the beans."],
      note: "Better the next day.",
      sourceName: "Grandma",
      sourceUrl: "example.com/chili",
      rating: 4,
      collectionIds: [2],
      ingredients: [
        { kind: "heading", text: "For the chili" },
        { kind: "ingredient", groceryName: "Onion", cookingAmount: "1", preparation: "diced", optional: false, subRecipeId: null },
        { kind: "ingredient", groceryName: "Hot sauce", cookingAmount: "2 tbsp", preparation: "", optional: true, subRecipeId: 9 },
      ],
    });
  });

  it("shows times in minutes and saves them in seconds, leaving blanks and zeros empty", () => {
    const form = formFromRecipe(chili);
    expect([form.prepMinutes, form.cookMinutes]).toEqual(["15", "60"]);
    const edited = apply(form, [
      { type: "setText", field: "prepMinutes", value: "" },
      { type: "setText", field: "cookMinutes", value: "0" },
    ]);
    expect(formToBody(edited)).toMatchObject({ prepTime: null, cookTime: null });
  });

  it("splits steps on blank lines and drops empty ones", () => {
    const form = apply(blankForm(), [{ type: "setText", field: "steps", value: "Chop.\n\n\n  Fry.  \n \nServe." }]);
    expect(formToBody(form).steps).toEqual(["Chop.", "Fry.", "Serve."]);
  });

  it("starts a new recipe with one empty ingredient", () => {
    expect(formToBody(blankForm()).ingredients).toEqual([
      { kind: "ingredient", groceryName: "", cookingAmount: "", preparation: "", optional: false, subRecipeId: null },
    ]);
  });

  it("adds, edits, moves and removes rows", () => {
    let form = apply(blankForm(), [{ type: "addHeading" }]);
    const [ingredient, heading] = form.rows;
    form = apply(form, [
      { type: "editIngredient", key: ingredient!.key, fields: { groceryName: "Garlic", subRecipeId: "4" } },
      { type: "editHeading", key: heading!.key, text: "Sauce" },
      { type: "moveRow", index: 1, by: -1 },
    ]);
    expect(formToBody(form).ingredients).toEqual([
      { kind: "heading", text: "Sauce" },
      { kind: "ingredient", groceryName: "Garlic", cookingAmount: "", preparation: "", optional: false, subRecipeId: 4 },
    ]);
    form = apply(form, [{ type: "removeRow", key: heading!.key }]);
    expect(formToBody(form).ingredients).toHaveLength(1);
  });

  it("keeps a row in place when it's moved past either end", () => {
    const form = apply(blankForm(), [{ type: "addHeading" }, { type: "moveRow", index: 0, by: -1 }, { type: "moveRow", index: 1, by: 1 }]);
    expect(form.rows.map((r) => r.kind)).toEqual(["ingredient", "heading"]);
  });

  it("turns one collection on or off without touching the others", () => {
    const form = apply(formFromRecipe(chili), [
      { type: "toggleCollection", collectionId: 5 },
      { type: "toggleCollection", collectionId: 2 },
    ]);
    expect(form.collectionIds).toEqual([5]);
  });
});
