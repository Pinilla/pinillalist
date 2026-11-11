import { describe, expect, it } from "vitest";
import type { MergedItem } from "./merge.ts";
import { buildStockCheck } from "./stock.ts";
import type { Grocery, ListItem } from "./types.ts";

const g = (id: number, name: string, location: Grocery["location"]): Grocery => ({ id, name, unit: "", location, product: null });
const onion = g(1, "Onion", "pantry");
const milk = g(2, "Whole milk", "fridge");
const tp = g(3, "Toilet paper", "master_bathroom");
const cumin = g(4, "Cumin", null);
const butter = g(5, "Butter", "fridge");
const groceries = new Map([onion, milk, tp, cumin, butter].map((x) => [x.id, x]));

const merged = (x: Grocery): MergedItem => ({
  groceryId: x.id,
  groceryName: x.name,
  uses: [{ recipeId: 9, recipeName: "Chili", ingredientId: x.id * 10, cookingAmount: "1", preparation: "" }],
});
const essential = (x: Grocery, details = ""): ListItem => ({ id: x.id * 100, groceryId: x.id, groceryName: x.name, amount: null, details, done: false });

describe("buildStockCheck", () => {
  it("walks the house in location order and checks groceries without a location last", () => {
    const items = buildStockCheck([merged(cumin), merged(milk), merged(onion)], [essential(tp)], groceries);
    expect(items.map((i) => i.groceryName)).toEqual(["Toilet paper", "Onion", "Whole milk", "Cumin"]);
  });

  it("starts recipe groceries at 1 and Essentials at 0", () => {
    const items = buildStockCheck([merged(onion)], [essential(tp, "Extra roll in the closet")], groceries);
    expect(items.map((i) => [i.groceryName, i.start, i.essential])).toEqual([
      ["Toilet paper", 0, { details: "Extra roll in the closet" }],
      ["Onion", 1, null],
    ]);
  });

  it("gives a grocery that's both in a recipe and an Essential one card that starts at 1", () => {
    const items = buildStockCheck([merged(butter)], [essential(butter)], groceries);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ groceryName: "Butter", start: 1, essential: { details: "" } });
    expect(items[0]!.uses).toHaveLength(1);
  });

  it("keeps recipe groceries in picked order, then Essentials, inside one location", () => {
    const items = buildStockCheck([merged(butter), merged(milk)], [essential(g(6, "Almond milk", "fridge"))], new Map([...groceries, [6, g(6, "Almond milk", "fridge")]]));
    expect(items.map((i) => i.groceryName)).toEqual(["Butter", "Whole milk", "Almond milk"]);
  });

  it("returns nothing when there are no recipes and no Essentials", () => {
    expect(buildStockCheck([], [], groceries)).toEqual([]);
  });
});
