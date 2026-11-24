import { buildCartPlan, type CartPlan, type OrderLine } from "./carts.ts";
import { mergeIngredients, type SubRecipeMode } from "./merge.ts";
import { buildStockCheck, type CheckItem } from "./stock.ts";
import type { Grocery, ListItem, Recipe, Store } from "./types.ts";

export const STEPS = ["Pick recipes", "Stock check", "Anything else", "Fill carts"] as const;

const STOCK_CHECK_STEP = 1;

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

export type OrderAction =
  | { type: "toggleRecipe"; recipeId: number }
  | { type: "pickRecipe"; recipeId: number; choice: RecipeChoice }
  | { type: "unpickRecipe"; recipeId: number }
  | { type: "filterCollections"; collectionIds: number[] }
  | { type: "goToStep"; step: number }
  | { type: "answerCard"; index: number; quantity: number }
  | { type: "showCard"; index: number }
  | { type: "showSummary" }
  | { type: "cardsChanged" }
  | { type: "addExtra"; groceryId: number }
  | { type: "setExtra"; groceryId: number; quantity: number }
  | { type: "removeLine"; groceryId: number }
  | { type: "putBack"; groceryId: number }
  | { type: "cartSent"; store: Store }
  | { type: "startOver" };

export interface OrderInputs {
  recipes: Recipe[];
  subRecipes: Map<number, Recipe>;
  essentials: ListItem[];
  groceries: Map<number, Grocery>;
}

export type StockCheckView =
  | { kind: "empty" }
  | { kind: "summary"; buying: number }
  | { kind: "card"; index: number; allAnswered: boolean };

export interface OrderPlan {
  check: CheckItem[];
  stockCheck: StockCheckView;
  lines: OrderLine[];
  carts: CartPlan;
}

export function loadOrder(saved: string | null): OrderState {
  if (!saved) return newOrder();
  try {
    return migrate(JSON.parse(saved) as SavedOrder);
  } catch {
    return newOrder();
  }
}

export function updateOrder(state: OrderState, action: OrderAction, check: CheckItem[]): OrderState {
  switch (action.type) {
    case "toggleRecipe":
      return state.recipeIds.includes(action.recipeId) ? unpickRecipe(state, action.recipeId) : pickRecipe(state, action.recipeId);
    case "pickRecipe":
      return pickRecipe(state, action.recipeId, action.choice);
    case "unpickRecipe":
      return unpickRecipe(state, action.recipeId);
    case "filterCollections":
      return { ...state, collectionFilters: action.collectionIds };
    case "goToStep":
      return goToStep(state, action.step, check);
    case "answerCard":
      return answerAndAdvance(state, check, action.index, action.quantity);
    case "showCard":
      return { ...state, stockIndex: action.index, stockReviewed: false };
    case "showSummary":
      return { ...state, stockReviewed: true };
    case "cardsChanged":
      return jumpToNewCard(state, check);
    case "addExtra":
      return setExtra(state, action.groceryId, (state.extras[action.groceryId] ?? 0) + 1);
    case "setExtra":
      return setExtra(state, action.groceryId, action.quantity);
    case "removeLine":
      return { ...state, removed: withItem(state.removed, action.groceryId) };
    case "putBack":
      return { ...state, removed: state.removed.filter((id) => id !== action.groceryId) };
    case "cartSent":
      return { ...state, sent: withItem(state.sent, action.store) };
    case "startOver":
      return newOrder();
  }
}

export function planOrder(state: OrderState, inputs: OrderInputs): OrderPlan {
  const merged = mergeIngredients(inputs.recipes, inputs.groceries, state.choices, inputs.subRecipes);
  const check = buildStockCheck(merged, inputs.essentials, inputs.groceries);
  const lines = orderLines(state, check, inputs.groceries);
  return { check, stockCheck: stockCheckView(state, check), lines, carts: buildCartPlan(lines) };
}

function newOrder(): OrderState {
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

type OldStockAnswer = number | { choice: "have" } | { choice: "all" | "some"; quantity: number };

type SavedOrder = Omit<Partial<OrderState>, "version" | "stock"> & {
  version?: number;
  stock?: Record<string, OldStockAnswer>;
  essentials?: Record<string, number>;
  collectionFilter?: number | null;
};

const VERSION_2_STEPS = [0, 1, 1, 2, 3];

function migrate(saved: SavedOrder): OrderState {
  const { collectionFilter, essentials, ...rest } = saved;
  const withFilters = { ...rest, collectionFilters: rest.collectionFilters ?? filtersFromSingle(collectionFilter) };
  if (saved.version === 3) return { ...newOrder(), ...withFilters, stock: (rest.stock ?? {}) as Record<string, number>, version: 3 };
  if (saved.version !== 1 && saved.version !== 2) return newOrder();
  return {
    ...newOrder(),
    ...withFilters,
    version: 3,
    stock: addEssentials(stockFromOldAnswers(rest.stock ?? {}), essentials ?? {}),
    step: VERSION_2_STEPS[rest.step ?? 0] ?? 0,
    stockReviewed: false,
  };
}

function filtersFromSingle(collectionFilter: number | null | undefined): number[] {
  return typeof collectionFilter === "number" ? [collectionFilter] : [];
}

function stockFromOldAnswers(answers: Record<string, OldStockAnswer>): Record<string, number> {
  return Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, quantityFromOldAnswer(answer)]));
}

function quantityFromOldAnswer(answer: OldStockAnswer): number {
  if (typeof answer === "number") return answer;
  return answer.choice === "have" ? 0 : answer.quantity;
}

function addEssentials(stock: Record<string, number>, essentials: Record<string, number>): Record<string, number> {
  const combined = { ...stock };
  for (const [id, quantity] of Object.entries(essentials)) combined[id] = (combined[id] ?? 0) + quantity;
  return combined;
}

function pickRecipe(state: OrderState, recipeId: number, choice?: RecipeChoice): OrderState {
  const choices = { ...state.choices };
  if (choice) choices[recipeId] = choice;
  else delete choices[recipeId];
  return { ...state, recipeIds: withItem(state.recipeIds, recipeId), choices, stockReviewed: false };
}

function unpickRecipe(state: OrderState, recipeId: number): OrderState {
  const { [recipeId]: _unpicked, ...choices } = state.choices;
  return { ...state, recipeIds: state.recipeIds.filter((id) => id !== recipeId), choices, stockReviewed: false };
}

function goToStep(state: OrderState, step: number, check: CheckItem[]): OrderState {
  const next = { ...state, step: Math.max(0, Math.min(STEPS.length - 1, step)) };
  return next.step === STOCK_CHECK_STEP ? openStockCheck(next, check) : next;
}

function openStockCheck(state: OrderState, check: CheckItem[]): OrderState {
  const unanswered = firstUnanswered(state, check);
  return { ...state, stockIndex: unanswered < check.length ? unanswered : 0, stockReviewed: false };
}

function answerAndAdvance(state: OrderState, check: CheckItem[], index: number, quantity: number): OrderState {
  const answered = { ...state, stock: { ...state.stock, [check[index]!.groceryId]: quantity } };
  if (index + 1 < check.length) return { ...answered, stockIndex: index + 1, stockReviewed: false };
  const unanswered = firstUnanswered(answered, check);
  if (unanswered < check.length) return { ...answered, stockIndex: unanswered, stockReviewed: false };
  return { ...answered, stockReviewed: true };
}

function jumpToNewCard(state: OrderState, check: CheckItem[]): OrderState {
  if (state.step !== STOCK_CHECK_STEP) return state;
  const unanswered = firstUnanswered(state, check);
  if (unanswered === check.length || !isAnswered(state, check[currentIndex(state, check)])) return state;
  return { ...state, stockIndex: unanswered, stockReviewed: false };
}

function setExtra(state: OrderState, groceryId: number, quantity: number): OrderState {
  const extras = { ...state.extras };
  if (quantity > 0) extras[groceryId] = quantity;
  else delete extras[groceryId];
  return { ...state, extras };
}

function withItem<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items : [...items, item];
}

function isAnswered(state: OrderState, item: CheckItem | undefined): boolean {
  return item !== undefined && state.stock[item.groceryId] !== undefined;
}

function firstUnanswered(state: OrderState, check: CheckItem[]): number {
  const index = check.findIndex((item) => !isAnswered(state, item));
  return index === -1 ? check.length : index;
}

function currentIndex(state: OrderState, check: CheckItem[]): number {
  return Math.min(state.stockIndex, check.length - 1);
}

function stockCheckView(state: OrderState, check: CheckItem[]): StockCheckView {
  if (check.length === 0) return { kind: "empty" };
  const allAnswered = firstUnanswered(state, check) === check.length;
  if (state.stockReviewed && allAnswered) return { kind: "summary", buying: countBuying(state, check) };
  return { kind: "card", index: currentIndex(state, check), allAnswered };
}

function countBuying(state: OrderState, check: CheckItem[]): number {
  return check.filter((item) => (state.stock[item.groceryId] ?? 0) > 0).length;
}

function orderLines(state: OrderState, check: CheckItem[], groceries: Map<number, Grocery>): OrderLine[] {
  const quantities = new Map<number, number>();
  const add = (groceryId: number, quantity: number) => {
    if (quantity > 0) quantities.set(groceryId, (quantities.get(groceryId) ?? 0) + quantity);
  };
  for (const item of check) add(item.groceryId, state.stock[item.groceryId] ?? 0);
  for (const [id, quantity] of Object.entries(state.extras)) add(Number(id), quantity);
  return [...quantities].flatMap(([groceryId, quantity]) => lineFor(state, groceries.get(groceryId), quantity));
}

function lineFor(state: OrderState, grocery: Grocery | undefined, quantity: number): OrderLine[] {
  if (!grocery || state.removed.includes(grocery.id)) return [];
  return [{ groceryId: grocery.id, groceryName: grocery.name, quantity, product: grocery.product }];
}
