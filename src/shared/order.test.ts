import { describe, expect, it } from "vitest";
import { loadOrder, planOrder, updateOrder, type OrderAction, type OrderInputs, type OrderState } from "./order.ts";
import type { Grocery, ListItem, Recipe } from "./types.ts";

const walmart = { store: "walmart" as const, storeId: "51259212", name: "Onions 3 lb", size: "3 lb", imageUrl: "", soldBy: "each" as const };
const onion: Grocery = { id: 1, name: "Onion", unit: "", location: "pantry", product: walmart };
const beef: Grocery = { id: 2, name: "Ground beef", unit: "lb", location: "fridge", product: null };
const tp: Grocery = { id: 3, name: "Toilet paper", unit: "", location: null, product: null };
const groceries = new Map([onion, beef, tp].map((g) => [g.id, g]));

function recipe(id: number, needs: Grocery[]): Recipe {
  return {
    id,
    name: `Recipe ${id}`,
    photo: null,
    collectionIds: [],
    hasExtras: false,
    servings: "",
    prepTime: null,
    cookTime: null,
    steps: [],
    note: "",
    sourceName: "",
    sourceUrl: "",
    rating: null,
    ingredients: needs.map((g) => ({
      kind: "ingredient" as const,
      id: id * 100 + g.id,
      groceryId: g.id,
      groceryName: g.name,
      cookingAmount: "1",
      preparation: "",
      optional: false,
      subRecipe: null,
    })),
  };
}

function essential(g: Grocery): ListItem {
  return { id: g.id * 10, groceryId: g.id, groceryName: g.name, amount: null, details: "", done: false };
}

const chili = recipe(7, [onion, beef]);

function inputs(recipes: Recipe[] = [chili], essentials: ListItem[] = [essential(tp)]): OrderInputs {
  return { recipes, subRecipes: new Map(), essentials, groceries };
}

function apply(state: OrderState, actions: OrderAction[], from = inputs()): OrderState {
  return actions.reduce((s, action) => updateOrder(s, action, planOrder(s, from).check), state);
}

const fresh = () => loadOrder(null);
const answer = (index: number, quantity: number): OrderAction => ({ type: "answerCard", index, quantity });

describe("planning the order", () => {
  it("walks the stock check through the picked recipes' groceries and the Essentials", () => {
    expect(planOrder(fresh(), inputs()).check.map((c) => c.groceryName)).toEqual(["Onion", "Ground beef", "Toilet paper"]);
  });

  it("buys what the stock check says to buy and skips what's at home", () => {
    const state = apply(fresh(), [answer(0, 1), answer(1, 0), answer(2, 0)]);
    expect(planOrder(state, inputs()).lines).toEqual([{ groceryId: 1, groceryName: "Onion", quantity: 1, product: walmart }]);
  });

  it("adds a grocery's stock check quantity and its Anything else quantity together", () => {
    const state = apply(fresh(), [answer(0, 1), answer(1, 0), answer(2, 2), { type: "addExtra", groceryId: onion.id }]);
    expect(planOrder(state, inputs()).lines.map((l) => [l.groceryName, l.quantity])).toEqual([
      ["Onion", 2],
      ["Toilet paper", 2],
    ]);
  });

  it("forgets answers for groceries the picked recipes no longer need", () => {
    const state = apply(fresh(), [answer(0, 1)]);
    expect(planOrder(state, inputs([], [])).lines).toEqual([]);
  });

  it("leaves out groceries removed on the last step until they're put back", () => {
    const added = apply(fresh(), [{ type: "addExtra", groceryId: onion.id }, { type: "addExtra", groceryId: tp.id }]);
    const removed = apply(added, [{ type: "removeLine", groceryId: onion.id }]);
    expect(planOrder(removed, inputs([], [])).lines.map((l) => l.groceryName)).toEqual(["Toilet paper"]);
    const putBack = apply(removed, [{ type: "putBack", groceryId: onion.id }]);
    expect(planOrder(putBack, inputs([], [])).lines.map((l) => l.groceryName)).toEqual(["Onion", "Toilet paper"]);
  });

  it("skips groceries that left the catalog", () => {
    const state = apply(fresh(), [{ type: "addExtra", groceryId: 99 }]);
    expect(planOrder(state, inputs([], [])).lines).toEqual([]);
  });

  it("fills a store cart from lines with a linked product and lists the rest to add by hand", () => {
    const state = apply(fresh(), [answer(0, 2), answer(1, 1), answer(2, 0)]);
    const { carts } = planOrder(state, inputs());
    expect(carts.carts.map((c) => c.url)).toEqual(["https://www.walmart.com/sc/cart/addToCart?items=51259212_2"]);
    expect(carts.unlinked.map((l) => l.groceryName)).toEqual(["Ground beef"]);
  });
});

describe("the stock check step", () => {
  it("has nothing to check without recipes or Essentials", () => {
    expect(planOrder(fresh(), inputs([], [])).stockCheck).toEqual({ kind: "empty" });
  });

  it("opens on the first unanswered card, or the first card when all are answered, never the summary", () => {
    let state = apply(fresh(), [answer(0, 1), { type: "goToStep", step: 1 }]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 1, allAnswered: false });
    state = apply(state, [answer(1, 0), answer(2, 0), { type: "goToStep", step: 1 }]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 0, allAnswered: true });
  });

  it("moves to the next card after an answer, even one answered before, and shows the summary after the last", () => {
    let state = apply(fresh(), [answer(0, 1), answer(1, 1), answer(2, 1), { type: "showCard", index: 0 }, answer(0, 2)]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 1, allAnswered: true });
    state = apply(state, [answer(1, 0), answer(2, 0)]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "summary", buying: 1 });
  });

  it("goes back to a card still unanswered after the last one", () => {
    const state = apply(fresh(), [answer(2, 1)]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 0, allAnswered: false });
  });

  it("jumps to the first new card when the picked recipes finish loading", () => {
    const onlyEssentials = inputs([], [essential(beef), essential(tp)]);
    let state = apply(fresh(), [{ type: "goToStep", step: 1 }, answer(0, 0), answer(1, 0)], onlyEssentials);
    expect(planOrder(state, onlyEssentials).stockCheck).toEqual({ kind: "summary", buying: 0 });
    state = apply(state, [{ type: "cardsChanged" }]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 0, allAnswered: false });
  });

  it("stays on an unanswered card when the cards change", () => {
    const state = apply(fresh(), [{ type: "goToStep", step: 1 }, answer(0, 1), { type: "cardsChanged" }]);
    expect(planOrder(state, inputs()).stockCheck).toEqual({ kind: "card", index: 1, allAnswered: false });
  });

  it("ignores changed cards on the other steps", () => {
    const state = apply(fresh(), [answer(0, 1), { type: "showCard", index: 2 }]);
    expect(apply(state, [{ type: "cardsChanged" }])).toBe(state);
  });
});

describe("changing the order", () => {
  it("keeps the step between the first and the last", () => {
    expect(apply(fresh(), [{ type: "goToStep", step: 9 }]).step).toBe(3);
    expect(apply(fresh(), [{ type: "goToStep", step: -1 }]).step).toBe(0);
  });

  it("toggles recipes in the order picked", () => {
    const state = apply(fresh(), [{ type: "toggleRecipe", recipeId: 5 }, { type: "toggleRecipe", recipeId: 2 }]);
    expect(state.recipeIds).toEqual([5, 2]);
    expect(apply(state, [{ type: "toggleRecipe", recipeId: 5 }]).recipeIds).toEqual([2]);
  });

  it("keeps the choices made when picking a recipe, and drops them when it's unpicked", () => {
    const choice = { optional: [41], subRecipes: { "50": "buy" as const } };
    let state = apply(fresh(), [{ type: "pickRecipe", recipeId: 5, choice }]);
    expect(state.recipeIds).toEqual([5]);
    expect(state.choices).toEqual({ "5": choice });
    state = apply(state, [{ type: "pickRecipe", recipeId: 5, choice: { optional: [], subRecipes: {} } }]);
    expect(state.recipeIds).toEqual([5]);
    expect(state.choices["5"]!.optional).toEqual([]);
    state = apply(state, [{ type: "unpickRecipe", recipeId: 5 }]);
    expect(state.recipeIds).toEqual([]);
    expect(state.choices).toEqual({});
  });

  it("sets and clears an Anything else quantity", () => {
    let state = apply(fresh(), [{ type: "addExtra", groceryId: tp.id }, { type: "addExtra", groceryId: tp.id }]);
    expect(state.extras).toEqual({ "3": 2 });
    state = apply(state, [{ type: "setExtra", groceryId: tp.id, quantity: 0 }]);
    expect(state.extras).toEqual({});
  });

  it("remembers each store's cart once", () => {
    const state = apply(fresh(), [{ type: "cartSent", store: "walmart" }, { type: "cartSent", store: "walmart" }]);
    expect(state.sent).toEqual(["walmart"]);
  });

  it("starts over with an empty order", () => {
    const state = apply(fresh(), [{ type: "toggleRecipe", recipeId: 5 }, { type: "goToStep", step: 3 }, { type: "startOver" }]);
    expect(state).toEqual(fresh());
  });
});

describe("loading a saved order", () => {
  it("starts fresh from missing or broken saved state", () => {
    expect(loadOrder("{not json")).toEqual(fresh());
    expect(loadOrder(JSON.stringify({ version: 0, step: 3 }))).toEqual(fresh());
    expect(loadOrder(JSON.stringify({ version: 3, step: 2 })).step).toBe(2);
  });

  it("turns an older order's single collection filter into a list", () => {
    expect(loadOrder(JSON.stringify({ version: 3, collectionFilter: 4 })).collectionFilters).toEqual([4]);
    expect(loadOrder(JSON.stringify({ version: 3, collectionFilter: null })).collectionFilters).toEqual([]);
    expect(loadOrder(JSON.stringify({ version: 2, collectionFilter: 7 })).collectionFilters).toEqual([7]);
    expect("collectionFilter" in loadOrder(JSON.stringify({ version: 3, collectionFilter: 4 }))).toBe(false);
  });

  it("keeps the answers of an order saved before quantities replaced the three choices", () => {
    const old = {
      version: 1,
      step: 1,
      recipeIds: [4],
      stock: { "1": { choice: "have" }, "2": { choice: "all", quantity: 2 }, "3": { choice: "some", buyAmount: 1, quantity: 3 } },
    };
    const state = loadOrder(JSON.stringify(old));
    expect(state.version).toBe(3);
    expect(state.recipeIds).toEqual([4]);
    expect(state.stock).toEqual({ "1": 0, "2": 2, "3": 3 });
  });

  it("moves a version 2 order's Essentials into the stock check and renumbers its steps", () => {
    const old = { version: 2, step: 3, stock: { "1": 1 }, stockReviewed: true, essentials: { "3": 2, "1": 1 }, extras: { "5": 1 } };
    const state = loadOrder(JSON.stringify(old));
    expect(state.version).toBe(3);
    expect(state.step).toBe(2);
    expect(state.stock).toEqual({ "1": 2, "3": 2 });
    expect(state.extras).toEqual({ "5": 1 });
    expect(state.stockReviewed).toBe(false);
    expect("essentials" in state).toBe(false);
    expect(loadOrder(JSON.stringify({ version: 2, step: 2 })).step).toBe(1);
    expect(loadOrder(JSON.stringify({ version: 2, step: 4 })).step).toBe(3);
  });
});
