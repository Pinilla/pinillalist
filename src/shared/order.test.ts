import { describe, expect, it } from "vitest";
import type { CheckItem } from "./stock.ts";
import { answerStock, firstUnanswered, loadOrder, newOrder, orderLines, pickRecipe, toggleRecipe } from "./order.ts";
import type { Grocery } from "./types.ts";

const walmart = { store: "walmart" as const, storeId: "51259212", name: "Onions 3 lb", size: "3 lb", imageUrl: "", soldBy: "each" as const };
const onion: Grocery = { id: 1, name: "Onion", unit: "", location: "pantry", product: walmart };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", location: "fridge", product: null };
const tp: Grocery = { id: 3, name: "Toilet paper", unit: "", location: null, product: null };
const groceries = new Map([onion, beef, tp].map((g) => [g.id, g]));

function item(g: Grocery, start = 1): CheckItem {
  return { groceryId: g.id, groceryName: g.name, location: g.location, uses: [], essential: start ? null : { details: "" }, start };
}

describe("orderLines", () => {
  it("includes needed stock items and skips the ones at home", () => {
    let state = newOrder();
    state = answerStock(state, onion.id, 1);
    state = answerStock(state, beef.id, 0);
    const lines = orderLines(state, [item(onion), item(beef)], groceries);
    expect(lines).toEqual([{ groceryId: 1, groceryName: "Onion", quantity: 1, product: walmart }]);
  });

  it("adds Essentials from the stock check and extras, combining a grocery that appears twice", () => {
    const state = {
      ...answerStock(answerStock(newOrder(), onion.id, 1), tp.id, 2),
      extras: { [onion.id]: 1 },
    };
    const lines = orderLines(state, [item(onion), item(tp, 0)], groceries);
    expect(lines.map((l) => [l.groceryName, l.quantity])).toEqual([
      ["Onion", 2],
      ["Toilet paper", 2],
    ]);
  });

  it("ignores answers for groceries the chosen recipes no longer need", () => {
    const state = answerStock(newOrder(), onion.id, 1);
    expect(orderLines(state, [], groceries)).toEqual([]);
  });

  it("leaves out groceries removed on the last step", () => {
    const state = { ...newOrder(), extras: { [onion.id]: 1, [tp.id]: 1 }, removed: [onion.id] };
    expect(orderLines(state, [], groceries).map((l) => l.groceryName)).toEqual(["Toilet paper"]);
  });

  it("skips groceries that left the catalog", () => {
    const state = { ...newOrder(), extras: { "99": 1 } };
    expect(orderLines(state, [], groceries)).toEqual([]);
  });
});

describe("order state", () => {
  it("toggles recipes in the order picked", () => {
    let s = toggleRecipe(newOrder(), 5);
    s = toggleRecipe(s, 2);
    expect(s.recipeIds).toEqual([5, 2]);
    expect(toggleRecipe(s, 5).recipeIds).toEqual([2]);
  });

  it("keeps the choices made when picking a recipe, and drops them when it's unpicked", () => {
    const choice = { optional: [41], subRecipes: { "50": "buy" as const } };
    let s = pickRecipe(newOrder(), 5, choice);
    expect(s.recipeIds).toEqual([5]);
    expect(s.choices).toEqual({ "5": choice });
    s = pickRecipe(s, 5, { optional: [], subRecipes: {} });
    expect(s.recipeIds).toEqual([5]);
    expect(s.choices["5"]!.optional).toEqual([]);
    s = toggleRecipe(s, 5);
    expect(s.recipeIds).toEqual([]);
    expect(s.choices).toEqual({});
  });

  it("finds the first unanswered stock card", () => {
    const merged = [item(onion), item(beef)];
    const s = answerStock(newOrder(), onion.id, 0);
    expect(firstUnanswered(s, merged)).toBe(1);
    expect(firstUnanswered(answerStock(s, beef.id, 0), merged)).toBe(2);
  });

  it("starts fresh from missing or broken saved state", () => {
    expect(loadOrder(null)).toEqual(newOrder());
    expect(loadOrder("{not json")).toEqual(newOrder());
    expect(loadOrder(JSON.stringify({ version: 0, step: 3 }))).toEqual(newOrder());
    expect(loadOrder(JSON.stringify({ version: 3, step: 2 })).step).toBe(2);
  });

  it("keeps the answers of an order saved before quantities replaced the three choices", () => {
    const old = {
      version: 1,
      step: 1,
      recipeIds: [4],
      stock: { "1": { choice: "have" }, "2": { choice: "all", quantity: 2 }, "3": { choice: "some", buyAmount: 1, quantity: 3 } },
    };
    const s = loadOrder(JSON.stringify(old));
    expect(s.version).toBe(3);
    expect(s.recipeIds).toEqual([4]);
    expect(s.stock).toEqual({ "1": 0, "2": 2, "3": 3 });
  });

  it("moves a version 2 order's Essentials into the stock check and renumbers its steps", () => {
    const old = { version: 2, step: 3, stock: { "1": 1 }, stockReviewed: true, essentials: { "3": 2, "1": 1 }, extras: { "5": 1 } };
    const s = loadOrder(JSON.stringify(old));
    expect(s.version).toBe(3);
    expect(s.step).toBe(2);
    expect(s.stock).toEqual({ "1": 2, "3": 2 });
    expect(s.extras).toEqual({ "5": 1 });
    expect(s.stockReviewed).toBe(false);
    expect("essentials" in s).toBe(false);
    expect(loadOrder(JSON.stringify({ version: 2, step: 2 })).step).toBe(1);
    expect(loadOrder(JSON.stringify({ version: 2, step: 4 })).step).toBe(3);
  });
});
