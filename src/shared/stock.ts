import { locationRank, type LocationKey } from "./locations.ts";
import type { IngredientUse, MergedItem } from "./merge.ts";
import type { Grocery, ListItem } from "./types.ts";

export interface CheckItem {
  groceryId: number;
  groceryName: string;
  location: LocationKey | null;
  uses: IngredientUse[];
  essential: { details: string } | null;
  start: number;
}

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
