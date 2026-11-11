import { locationRank, type LocationKey } from "./locations.ts";
import type { IngredientUse, MergedItem } from "./merge.ts";
import type { Grocery, ListItem } from "./types.ts";

/** One card in the stock check: a grocery to look for at home, from the picked recipes, the Essentials list, or both. */
export interface CheckItem {
  groceryId: number;
  groceryName: string;
  location: LocationKey | null;
  /** The picked recipes' ingredient lines for this grocery. Empty for an Essential no recipe needs. */
  uses: IngredientUse[];
  /** Set when the grocery is on the Essentials list, with the list item's note. */
  essential: { details: string } | null;
  /** The quantity the card starts at: 1 when a recipe needs it, 0 for an Essential that's only checked for being low. */
  start: number;
}

/**
 * Builds the stock check as one walk through the house. Recipe groceries and
 * Essentials are mixed together and sorted by location in walk order, with
 * groceries that have no location last. Inside a location, recipe groceries
 * keep the order the recipes were picked in, then come the Essentials in list order.
 */
export function buildStockCheck(merged: MergedItem[], essentials: ListItem[], groceries: Map<number, Grocery>): CheckItem[] {
  const items = new Map<number, CheckItem>();
  for (const m of merged) {
    items.set(m.groceryId, {
      groceryId: m.groceryId,
      groceryName: m.groceryName,
      location: groceries.get(m.groceryId)?.location ?? null,
      uses: m.uses,
      essential: null,
      start: 1,
    });
  }
  for (const e of essentials) {
    const existing = items.get(e.groceryId);
    if (existing) {
      existing.essential = { details: e.details };
      continue;
    }
    const grocery = groceries.get(e.groceryId);
    items.set(e.groceryId, {
      groceryId: e.groceryId,
      groceryName: grocery?.name ?? e.groceryName,
      location: grocery?.location ?? null,
      uses: [],
      essential: { details: e.details },
      start: 0,
    });
  }
  const list = [...items.values()];
  const order = new Map(list.map((item, i) => [item.groceryId, i]));
  return list.sort((a, b) => locationRank(a.location) - locationRank(b.location) || order.get(a.groceryId)! - order.get(b.groceryId)!);
}
