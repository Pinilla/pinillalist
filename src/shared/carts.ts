import { ASIN, WALMART_ID } from "./links.ts";
import type { Product, Store } from "./types.ts";

/** One thing the weekly order wants from a store: a grocery and how many of its product to buy. */
export interface OrderLine {
  groceryId: number;
  groceryName: string;
  quantity: number;
  product: Product | null;
}

export interface StoreCart {
  store: Store;
  url: string;
  lines: OrderLine[];
}

export interface CartPlan {
  carts: StoreCart[];
  /** Lines whose grocery has no linked product. Add these in the store app by hand. */
  unlinked: OrderLine[];
  /** Lines whose product ID the store would reject. Fix the link in the catalog. */
  invalid: OrderLine[];
}

function cartQuantity(line: OrderLine): number {
  if (line.product?.soldBy === "pound") return Math.round(line.quantity * 100) / 100;
  return Math.max(1, Math.round(line.quantity));
}

/**
 * Builds one add-to-cart link per store from the weekly order. Lines with a zero
 * quantity are dropped, two lines for the same product are added together, and
 * only IDs the store accepts go into a link, because one bad Walmart ID makes
 * Walmart skip the whole cart.
 */
export function buildCartPlan(lines: OrderLine[]): CartPlan {
  const unlinked: OrderLine[] = [];
  const invalid: OrderLine[] = [];
  const byStore = new Map<Store, OrderLine[]>();

  for (const line of lines) {
    if (!(line.quantity > 0)) continue;
    if (!line.product) {
      unlinked.push(line);
      continue;
    }
    const valid = line.product.store === "walmart" ? WALMART_ID.test(line.product.storeId) : ASIN.test(line.product.storeId);
    if (!valid) {
      invalid.push(line);
      continue;
    }
    const list = byStore.get(line.product.store) ?? [];
    list.push(line);
    byStore.set(line.product.store, list);
  }

  const carts: StoreCart[] = [];
  for (const store of ["walmart", "amazon"] as const) {
    const storeLines = byStore.get(store);
    if (!storeLines) continue;
    const totals = new Map<string, number>();
    for (const line of storeLines) {
      const id = line.product!.storeId;
      totals.set(id, (totals.get(id) ?? 0) + cartQuantity(line));
    }
    carts.push({ store, lines: storeLines, url: cartUrl(store, totals) });
  }
  return { carts, unlinked, invalid };
}

function cartUrl(store: Store, totals: Map<string, number>): string {
  const entries = [...totals];
  if (store === "walmart") {
    const items = entries.map(([id, qty]) => `${id}_${qty}`).join(",");
    return `https://www.walmart.com/sc/cart/addToCart?items=${items}`;
  }
  const params = entries
    .map(([asin, qty], i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=${qty}`)
    .join("&");
  return `https://www.amazon.com/gp/aws/cart/add.html?${params}`;
}
