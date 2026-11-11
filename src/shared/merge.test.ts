import { describe, expect, it } from "vitest";
import { mergeIngredients, subRecipeIds } from "./merge.ts";
import type { Grocery, IngredientRow, Recipe } from "./types.ts";

const onion: Grocery = { id: 1, name: "Onion", unit: "", location: null, product: null };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", location: null, product: null };
const groceries = new Map([onion, beef].map((g) => [g.id, g]));

let nextId = 1;
function ing(grocery: Grocery, cookingAmount = "", preparation = "", extra: Partial<Extract<IngredientRow, { kind: "ingredient" }>> = {}): IngredientRow {
  return {
    kind: "ingredient", id: nextId++, groceryId: grocery.id, groceryName: grocery.name, cookingAmount, preparation,
    optional: false, subRecipe: null, ...extra,
  };
}
function recipe(id: number, name: string, ingredients: IngredientRow[]): Recipe {
  return {
    id, name, photo: null, collectionIds: [], servings: "", prepTime: null, cookTime: null, steps: [],
    note: "", sourceName: "", sourceUrl: "", rating: null, ingredients, hasExtras: false,
  };
}

describe("mergeIngredients", () => {
  it("makes one item per grocery and keeps each recipe's ingredient line", () => {
    const chili = recipe(1, "Chili", [ing(onion, "2", "diced"), ing(beef, "1 lb")]);
    const tacos = recipe(2, "Tacos", [ing(onion, "1 cup"), ing(beef, "1.5 lb")]);
    const items = mergeIngredients([chili, tacos], groceries);
    expect(items.map((i) => [i.groceryName, i.uses.map((u) => `${u.cookingAmount}|${u.preparation}|${u.recipeName}`)])).toEqual([
      ["Onion", ["2|diced|Chili", "1 cup||Tacos"]],
      ["Ground beef", ["1 lb||Chili", "1.5 lb||Tacos"]],
    ]);
  });

  it("puts two lines for the same grocery in one recipe under one item", () => {
    const r = recipe(1, "Soup", [ing(onion, "1", "diced"), ing(onion, "1", "")]);
    const items = mergeIngredients([r], groceries);
    expect(items).toHaveLength(1);
    expect(items[0]!.uses).toHaveLength(2);
  });

  it("skips section headings", () => {
    const r = recipe(1, "Bowl", [{ kind: "heading", id: 99, text: "For the sauce" }, ing(onion, "1")]);
    expect(mergeIngredients([r], groceries)).toHaveLength(1);
  });

  it("uses the catalog's name for the grocery", () => {
    const row = { ...ing(onion, "1"), groceryName: "Old name" } as IngredientRow;
    expect(mergeIngredients([recipe(1, "A", [row])], groceries)[0]!.groceryName).toBe("Onion");
  });

  it("leaves out optional ingredients unless they were picked with the recipe", () => {
    const radish: Grocery = { id: 7, name: "Radishes", unit: "", location: null, product: null };
    const lime: Grocery = { id: 8, name: "Limes", unit: "", location: null, product: null };
    const all = new Map([...groceries, [7, radish], [8, lime]]);
    const radishRow = ing(radish, "", "sliced", { optional: true });
    const limeRow = ing(lime, "", "wedges", { optional: true });
    const pozole = recipe(1, "Pozole", [ing(onion, "1"), radishRow, limeRow]);
    expect(mergeIngredients([pozole], all).map((i) => i.groceryName)).toEqual(["Onion"]);
    const picked = mergeIngredients([pozole], all, { 1: { optional: [limeRow.id], subRecipes: {} } });
    expect(picked.map((i) => i.groceryName)).toEqual(["Onion", "Limes"]);
  });

  describe("an ingredient made from another recipe", () => {
    const sauce: Grocery = { id: 9, name: "Hot honey sauce", unit: "", location: null, product: null };
    const honey: Grocery = { id: 10, name: "Honey", unit: "", location: null, product: null };
    const all = new Map([...groceries, [9, sauce], [10, honey]]);
    const inner = recipe(20, "Hot Honey", [ing(honey, "1 cup"), ing(onion, "1", "", { optional: true })]);
    const sauceRow = ing(sauce, "", "", { subRecipe: { id: 20, name: "Hot Honey" } });
    const bowl = recipe(2, "Burrito Bowls", [ing(beef, "1 lb"), sauceRow]);
    const subs = new Map([[20, inner]]);
    const lines = (items: ReturnType<typeof mergeIngredients>) => items.map((i) => `${i.groceryName}: ${i.uses.map((u) => u.recipeName).join(", ")}`);

    it("is made by default, bringing in the inner recipe's ingredients but not its optional ones", () => {
      expect(lines(mergeIngredients([bowl], all, {}, subs))).toEqual(["Ground beef: Burrito Bowls", "Honey: Hot Honey (in Burrito Bowls)"]);
    });

    it("can be bought instead, which brings in its grocery", () => {
      const choices = { 2: { optional: [], subRecipes: { [sauceRow.id]: "buy" as const } } };
      expect(lines(mergeIngredients([bowl], all, choices, subs))).toEqual(["Ground beef: Burrito Bowls", "Hot honey sauce: Burrito Bowls"]);
    });

    it("can be left out when it's already made", () => {
      const choices = { 2: { optional: [], subRecipes: { [sauceRow.id]: "have" as const } } };
      expect(lines(mergeIngredients([bowl], all, choices, subs))).toEqual(["Ground beef: Burrito Bowls"]);
    });

    it("falls back to its grocery when the inner recipe isn't loaded or was deleted", () => {
      expect(lines(mergeIngredients([bowl], all, {}, new Map()))).toEqual(["Ground beef: Burrito Bowls", "Hot honey sauce: Burrito Bowls"]);
    });

    it("is skipped by default when it's also optional, and can still be made", () => {
      const optionalRow = { ...sauceRow, optional: true } as IngredientRow;
      const steak = recipe(3, "Steak", [ing(beef, "1 lb"), optionalRow]);
      expect(lines(mergeIngredients([steak], all, {}, subs))).toEqual(["Ground beef: Steak"]);
      const made = { 3: { optional: [], subRecipes: { [sauceRow.id]: "make" as const } } };
      expect(lines(mergeIngredients([steak], all, made, subs))).toEqual(["Ground beef: Steak", "Honey: Hot Honey (in Steak)"]);
    });

    it("lists the inner recipes to fetch", () => {
      expect(subRecipeIds([bowl, inner])).toEqual([20]);
    });
  });

  it("returns nothing for no recipes", () => {
    expect(mergeIngredients([], groceries)).toEqual([]);
  });
});
