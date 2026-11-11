import { describe, expect, it } from "vitest";
import { mergeIngredients } from "./merge.ts";
import type { Grocery, IngredientRow, Recipe } from "./types.ts";

const onion: Grocery = { id: 1, name: "Onion", unit: "", product: null };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", product: null };
const groceries = new Map([onion, beef].map((g) => [g.id, g]));

let nextId = 1;
function ing(grocery: Grocery, cookingAmount = "", preparation = ""): IngredientRow {
  return { kind: "ingredient", id: nextId++, groceryId: grocery.id, groceryName: grocery.name, cookingAmount, preparation };
}
function recipe(id: number, name: string, ingredients: IngredientRow[]): Recipe {
  return {
    id, name, photo: null, collectionIds: [], servings: "", prepTime: null, cookTime: null, steps: [],
    note: "", sourceName: "", sourceUrl: "", rating: null, ingredients,
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

  it("returns nothing for no recipes", () => {
    expect(mergeIngredients([], groceries)).toEqual([]);
  });
});
