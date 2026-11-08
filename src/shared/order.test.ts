import { describe, expect, it } from "vitest";
import type { MergedItem } from "./merge.ts";
import { answerStock, firstUnanswered, loadOrder, newOrder, orderLines, toggleRecipe } from "./order.ts";
import type { Grocery } from "./types.ts";

const walmart = { store: "walmart" as const, storeId: "51259212", name: "Onions 3 lb", size: "3 lb", imageUrl: "", soldBy: "each" as const };
const onion: Grocery = { id: 1, name: "Onion", unit: "", product: walmart };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", product: null };
const tp: Grocery = { id: 3, name: "Toilet paper", unit: "", product: null };
const groceries = new Map([onion, beef, tp].map((g) => [g.id, g]));

function item(g: Grocery, total: number): MergedItem {
  return { groceryId: g.id, groceryName: g.name, unit: g.unit, total, uses: [], recipeNames: ["Chili"] };
}

describe("orderLines", () => {
  it("includes needed stock items and skips the ones at home", () => {
    let state = newOrder();
    state = answerStock(state, onion.id, { choice: "all", quantity: 1 });
    state = answerStock(state, beef.id, { choice: "have" });
    const lines = orderLines(state, [item(onion, 3), item(beef, 2)], groceries);
    expect(lines).toEqual([{ groceryId: 1, groceryName: "Onion", quantity: 1, product: walmart }]);
  });

  it("uses the product quantity, not the buying amount", () => {
    const state = answerStock(newOrder(), onion.id, { choice: "some", buyAmount: 2, quantity: 1 });
    expect(orderLines(state, [item(onion, 3)], groceries)[0]!.quantity).toBe(1);
  });

  it("adds essentials and extras, combining a grocery that appears twice", () => {
    const state = {
      ...answerStock(newOrder(), onion.id, { choice: "all", quantity: 1 }),
      essentials: { [tp.id]: 2 },
      extras: { [onion.id]: 1 },
    };
    const lines = orderLines(state, [item(onion, 3)], groceries);
    expect(lines.map((l) => [l.groceryName, l.quantity])).toEqual([
      ["Onion", 2],
      ["Toilet paper", 2],
    ]);
  });

  it("ignores answers for groceries the chosen recipes no longer need", () => {
    const state = answerStock(newOrder(), onion.id, { choice: "all", quantity: 1 });
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

  it("finds the first unanswered stock card", () => {
    const merged = [item(onion, 1), item(beef, 1)];
    const s = answerStock(newOrder(), onion.id, { choice: "have" });
    expect(firstUnanswered(s, merged)).toBe(1);
    expect(firstUnanswered(answerStock(s, beef.id, { choice: "have" }), merged)).toBe(2);
  });

  it("starts fresh from missing or broken saved state", () => {
    expect(loadOrder(null)).toEqual(newOrder());
    expect(loadOrder("{not json")).toEqual(newOrder());
    expect(loadOrder(JSON.stringify({ version: 0, step: 3 }))).toEqual(newOrder());
    expect(loadOrder(JSON.stringify({ version: 1, step: 3 })).step).toBe(3);
  });
});
