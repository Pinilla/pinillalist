import type { OrderLine } from "./carts.ts";
import type { MergedItem } from "./merge.ts";
import type { Grocery } from "./types.ts";

export type StockChoice =
  | { choice: "have" }
  | { choice: "all"; quantity: number }
  | { choice: "some"; buyAmount: number; quantity: number };

export const STEPS = ["Pick recipes", "Stock check", "Essentials", "Anything else", "Fill carts"] as const;

/** One phone's weekly order in progress. It lives in the phone's local storage, never on the server. */
export interface OrderState {
  version: 1;
  step: number;
  recipeIds: number[];
  collectionFilter: number | null;
  /** Stock check answers by grocery id. */
  stock: Record<string, StockChoice>;
  stockIndex: number;
  /** True once the last card is answered, so the summary shows. */
  stockReviewed: boolean;
  /** Essentials marked low this week: grocery id to product quantity. */
  essentials: Record<string, number>;
  /** Anything else: grocery id to product quantity, in the order added. */
  extras: Record<string, number>;
  /** Stores whose cart link this phone has opened. */
  sent: string[];
  /** Groceries taken out on the last step, such as a product the store rejected. */
  removed: number[];
}

export function newOrder(): OrderState {
  return {
    version: 1,
    step: 0,
    recipeIds: [],
    collectionFilter: null,
    stock: {},
    stockIndex: 0,
    stockReviewed: false,
    essentials: {},
    extras: {},
    sent: [],
    removed: [],
  };
}

/** Reads a saved order, falling back to a new one if it's missing or from an older version. */
export function loadOrder(saved: string | null): OrderState {
  if (!saved) return newOrder();
  try {
    const parsed = JSON.parse(saved) as Partial<OrderState>;
    if (parsed.version !== 1) return newOrder();
    return { ...newOrder(), ...parsed };
  } catch {
    return newOrder();
  }
}

/** Picks or unpicks a recipe. Answers for groceries no chosen recipe needs any more drop out later. */
export function toggleRecipe(state: OrderState, recipeId: number): OrderState {
  const has = state.recipeIds.includes(recipeId);
  return {
    ...state,
    recipeIds: has ? state.recipeIds.filter((id) => id !== recipeId) : [...state.recipeIds, recipeId],
    stockReviewed: false,
  };
}

export function answerStock(state: OrderState, groceryId: number, answer: StockChoice): OrderState {
  return { ...state, stock: { ...state.stock, [groceryId]: answer } };
}

/**
 * Turns the order into lines for the store carts: needed stock check items,
 * low essentials and extras, one line per grocery with the quantities added.
 * Stock answers for groceries the chosen recipes no longer need are ignored,
 * and so are groceries removed on the last step.
 */
export function orderLines(state: OrderState, merged: MergedItem[], groceries: Map<number, Grocery>): OrderLine[] {
  const quantities = new Map<number, number>();
  const add = (groceryId: number, qty: number) => {
    if (qty > 0) quantities.set(groceryId, (quantities.get(groceryId) ?? 0) + qty);
  };
  for (const item of merged) {
    const answer = state.stock[item.groceryId];
    if (answer && answer.choice !== "have") add(item.groceryId, answer.quantity);
  }
  for (const [id, qty] of Object.entries(state.essentials)) add(Number(id), qty);
  for (const [id, qty] of Object.entries(state.extras)) add(Number(id), qty);

  return [...quantities].flatMap(([groceryId, quantity]) => {
    if (state.removed.includes(groceryId)) return [];
    const grocery = groceries.get(groceryId);
    if (!grocery) return [];
    return [{ groceryId, groceryName: grocery.name, quantity, product: grocery.product }];
  });
}

/** The first stock check card without an answer, or the number of cards when all are answered. */
export function firstUnanswered(state: OrderState, merged: MergedItem[]): number {
  const i = merged.findIndex((item) => !state.stock[item.groceryId]);
  return i === -1 ? merged.length : i;
}
