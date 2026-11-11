import type { OrderLine } from "./carts.ts";
import type { CheckItem } from "./stock.ts";
import type { Grocery } from "./types.ts";

export const STEPS = ["Pick recipes", "Stock check", "Anything else", "Fill carts"] as const;

/** One phone's weekly order in progress. It lives in the phone's local storage, never on the server. */
export interface OrderState {
  version: 3;
  step: number;
  recipeIds: number[];
  collectionFilter: number | null;
  /** Stock check answers, for recipe groceries and Essentials alike: grocery id to product quantity. 0 means there's enough at home. */
  stock: Record<string, number>;
  stockIndex: number;
  /** True once the last card is answered, so the summary shows. */
  stockReviewed: boolean;
  /** Anything else: grocery id to product quantity, in the order added. */
  extras: Record<string, number>;
  /** Stores whose cart link this phone has opened. */
  sent: string[];
  /** Groceries taken out on the last step, such as a product the store rejected. */
  removed: number[];
}

export function newOrder(): OrderState {
  return {
    version: 3,
    step: 0,
    recipeIds: [],
    collectionFilter: null,
    stock: {},
    stockIndex: 0,
    stockReviewed: false,
    extras: {},
    sent: [],
    removed: [],
  };
}

/** Version 1 stored each stock answer as "have it", "need all" or "need some" with a quantity. */
type OldStockChoice = { choice: "have" } | { choice: "all" | "some"; quantity: number };

/** Version 2 had a separate Essentials step (step 2), so its later steps were one higher. */
const V2_STEP = [0, 1, 1, 2, 3];

/**
 * Reads a saved order, falling back to a new one if it's missing or broken.
 * Older versions keep their answers: version 1's three choices become
 * quantities, and version 2's Essentials answers move into the stock check.
 */
export function loadOrder(saved: string | null): OrderState {
  if (!saved) return newOrder();
  try {
    const parsed = JSON.parse(saved) as Omit<Partial<OrderState>, "version" | "stock"> & {
      version?: number;
      stock?: Record<string, unknown>;
      essentials?: Record<string, number>;
    };
    if (parsed.version === 3) return { ...newOrder(), ...parsed, stock: (parsed.stock ?? {}) as Record<string, number>, version: 3 };
    if (parsed.version !== 1 && parsed.version !== 2) return newOrder();
    const stock: Record<string, number> = {};
    for (const [id, a] of Object.entries(parsed.stock ?? {})) {
      stock[id] = typeof a === "number" ? a : (a as OldStockChoice).choice === "have" ? 0 : (a as { quantity: number }).quantity;
    }
    const lowEssentials = Object.entries(parsed.essentials ?? {});
    for (const [id, qty] of lowEssentials) stock[id] = (stock[id] ?? 0) + qty;
    const { essentials: _dropped, ...rest } = parsed;
    return {
      ...newOrder(),
      ...rest,
      version: 3,
      stock,
      step: V2_STEP[parsed.step ?? 0] ?? 0,
      // Essentials the old order never asked about are now unanswered cards, so show them before the summary.
      stockReviewed: false,
    };
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

/** Records how many of a grocery's product to buy. 0 means there's enough at home. */
export function answerStock(state: OrderState, groceryId: number, quantity: number): OrderState {
  return { ...state, stock: { ...state.stock, [groceryId]: quantity } };
}

/**
 * Turns the order into lines for the store carts: the stock check's quantities
 * and the extras, one line per grocery with the quantities added. Answers for
 * groceries no longer in the stock check are ignored, and so are groceries
 * removed on the last step.
 */
export function orderLines(state: OrderState, check: CheckItem[], groceries: Map<number, Grocery>): OrderLine[] {
  const quantities = new Map<number, number>();
  const add = (groceryId: number, qty: number) => {
    if (qty > 0) quantities.set(groceryId, (quantities.get(groceryId) ?? 0) + qty);
  };
  for (const item of check) add(item.groceryId, state.stock[item.groceryId] ?? 0);
  for (const [id, qty] of Object.entries(state.extras)) add(Number(id), qty);

  return [...quantities].flatMap(([groceryId, quantity]) => {
    if (state.removed.includes(groceryId)) return [];
    const grocery = groceries.get(groceryId);
    if (!grocery) return [];
    return [{ groceryId, groceryName: grocery.name, quantity, product: grocery.product }];
  });
}

/** The first stock check card without an answer, or the number of cards when all are answered. */
export function firstUnanswered(state: OrderState, check: CheckItem[]): number {
  const i = check.findIndex((item) => state.stock[item.groceryId] === undefined);
  return i === -1 ? check.length : i;
}
