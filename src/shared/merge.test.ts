import { describe, expect, it } from "vitest";
import { mergeIngredients, missingAmounts } from "./merge.ts";
import type { Grocery, IngredientRow, Recipe } from "./types.ts";

const onion: Grocery = { id: 1, name: "Onion", unit: "", product: null };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", product: null };
const cumin: Grocery = { id: 3, name: "Cumin", unit: "jar", product: null };
const groceries = new Map([onion, beef, cumin].map((g) => [g.id, g]));

let nextId = 1;
function ing(grocery: Grocery, buyingAmount: number | null, cookingAmount = "", preparation = ""): IngredientRow {
  return { kind: "ingredient", id: nextId++, groceryId: grocery.id, groceryName: grocery.name, cookingAmount, preparation, buyingAmount };
}
function recipe(id: number, name: string, ingredients: IngredientRow[]): Recipe {
  return {
    id, name, photo: null, collectionIds: [], servings: "", prepTime: null, cookTime: null, steps: [],
    note: "", sourceName: "", sourceUrl: "", rating: null, ingredients,
  };
}

describe("mergeIngredients", () => {
  it("makes one item per grocery and adds up buying amounts across recipes", () => {
    const chili = recipe(1, "Chili", [ing(onion, 2, "2 onions", "diced"), ing(beef, 1)]);
    const tacos = recipe(2, "Tacos", [ing(onion, 1, "1 onion"), ing(beef, 1.5)]);
    const items = mergeIngredients([chili, tacos], groceries);
    expect(items.map((i) => [i.groceryName, i.total, i.recipeNames])).toEqual([
      ["Onion", 3, ["Chili", "Tacos"]],
      ["Ground beef", 2.5, ["Chili", "Tacos"]],
    ]);
  });

  it("ignores preparations, so diced onion and onion are one item", () => {
    const r = recipe(1, "Soup", [ing(onion, 1, "1", "diced"), ing(onion, 1, "1", "")]);
    const items = mergeIngredients([r], groceries);
    expect(items).toHaveLength(1);
    expect(items[0]!.total).toBe(2);
    expect(items[0]!.recipeNames).toEqual(["Soup"]);
  });

  it("skips section headings", () => {
    const r = recipe(1, "Bowl", [{ kind: "heading", id: 99, text: "For the sauce" }, ing(onion, 1)]);
    expect(mergeIngredients([r], groceries)).toHaveLength(1);
  });

  it("keeps a null total when no ingredient has a buying amount", () => {
    const r = recipe(1, "Rub", [ing(cumin, null, "1 tsp")]);
    const [item] = mergeIngredients([r], groceries);
    expect(item!.total).toBeNull();
    expect(missingAmounts(item!).map((u) => u.cookingAmount)).toEqual(["1 tsp"]);
  });

  it("sums known amounts and reports the missing ones", () => {
    const a = recipe(1, "A", [ing(onion, 2)]);
    const b = recipe(2, "B", [ing(onion, null, "1 cup")]);
    const [item] = mergeIngredients([a, b], groceries);
    expect(item!.total).toBe(2);
    expect(missingAmounts(item!).map((u) => u.recipeName)).toEqual(["B"]);
  });

  it("uses the catalog's unit for the grocery", () => {
    const [item] = mergeIngredients([recipe(1, "A", [ing(beef, 1)])], groceries);
    expect(item!.unit).toBe("lb");
  });

  it("returns nothing for no recipes", () => {
    expect(mergeIngredients([], groceries)).toEqual([]);
  });
});
