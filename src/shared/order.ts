import type { OrderLine } from "./carts.ts";
import type { SubRecipeMode } from "./merge.ts";
import type { CheckItem } from "./stock.ts";
import type { Grocery } from "./types.ts";

export const STEPS = ["Pick recipes", "Stock check", "Anything else", "Fill carts"] as const;

export interface RecipeChoice {
  optional: number[];
  subRecipes: Record<string, SubRecipeMode>;
}

export interface OrderState {
  version: 3;
  step: number;
  recipeIds: number[];
  choices: Record<string, RecipeChoice>;
  collectionFilters: number[];
  stock: Record<string, number>;
  stockIndex: number;
  stockReviewed: boolean;
  extras: Record<string, number>;
  sent: string[];
  removed: number[];
}

export function newOrder(): OrderState {
  return {
    version: 3,
    step: 0,
    recipeIds: [],
    choices: {},
    collectionFilters: [],
    stock: {},
    stockIndex: 0,
    stockReviewed: false,
    extras: {},
    sent: [],
    removed: [],
  };
}

type OldStockChoice = { choice: "have" } | { choice: "all" | "some"; quantity: number };

const V2_STEP = [0, 1, 1, 2, 3];

export function loadOrder(saved: string | null): OrderState {
  if (!saved) return newOrder();
  try {
    const raw = JSON.parse(saved) as Omit<Partial<OrderState>, "version" | "stock"> & {
      version?: number;
      stock?: Record<string, unknown>;
      essentials?: Record<string, number>;
      collectionFilter?: number | null;
    };
    const { collectionFilter, ...parsed } = raw;
    if (parsed.collectionFilters === undefined && typeof collectionFilter === "number") parsed.collectionFilters = [collectionFilter];
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
      stockReviewed: false,
    };
  } catch {
    return newOrder();
  }
}

export function toggleRecipe(state: OrderState, recipeId: number): OrderState {
  const has = state.recipeIds.includes(recipeId);
  return has ? unpickRecipe(state, recipeId) : pickRecipe(state, recipeId);
}

export function pickRecipe(state: OrderState, recipeId: number, choice?: RecipeChoice): OrderState {
  const choices = { ...state.choices };
  if (choice) choices[recipeId] = choice;
  else delete choices[recipeId];
  return {
    ...state,
    recipeIds: state.recipeIds.includes(recipeId) ? state.recipeIds : [...state.recipeIds, recipeId],
    choices,
    stockReviewed: false,
  };
}

export function unpickRecipe(state: OrderState, recipeId: number): OrderState {
  const { [recipeId]: _dropped, ...choices } = state.choices;
  return { ...state, recipeIds: state.recipeIds.filter((id) => id !== recipeId), choices, stockReviewed: false };
}

export function answerStock(state: OrderState, groceryId: number, quantity: number): OrderState {
  return { ...state, stock: { ...state.stock, [groceryId]: quantity } };
}

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

export function firstUnanswered(state: OrderState, check: CheckItem[]): number {
  const i = check.findIndex((item) => state.stock[item.groceryId] === undefined);
  return i === -1 ? check.length : i;
}

export function openStockCheck(state: OrderState, check: CheckItem[]): OrderState {
  const unanswered = firstUnanswered(state, check);
  return { ...state, stockIndex: unanswered < check.length ? unanswered : 0, stockReviewed: false };
}

export function answerAndAdvance(state: OrderState, check: CheckItem[], index: number, quantity: number): OrderState {
  const next = answerStock(state, check[index]!.groceryId, quantity);
  if (index + 1 < check.length) return { ...next, stockIndex: index + 1, stockReviewed: false };
  const unanswered = firstUnanswered(next, check);
  return unanswered < check.length ? { ...next, stockIndex: unanswered, stockReviewed: false } : { ...next, stockReviewed: true };
}
