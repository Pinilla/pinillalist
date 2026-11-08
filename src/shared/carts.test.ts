import { describe, expect, it } from "vitest";
import { buildCartPlan, type OrderLine } from "./carts.ts";
import type { Product } from "./types.ts";

function walmart(storeId: string, soldBy: Product["soldBy"] = "each"): Product {
  return { store: "walmart", storeId, name: "", size: "", imageUrl: "", soldBy };
}
function amazon(storeId: string): Product {
  return { store: "amazon", storeId, name: "", size: "", imageUrl: "", soldBy: "each" };
}
let nextId = 1;
function line(product: Product | null, quantity = 1): OrderLine {
  const id = nextId++;
  return { groceryId: id, groceryName: `Grocery ${id}`, quantity, product };
}

describe("buildCartPlan", () => {
  it("builds a Walmart link with item IDs and quantities", () => {
    const plan = buildCartPlan([line(walmart("10450114"), 2), line(walmart("51259212"))]);
    expect(plan.carts).toHaveLength(1);
    expect(plan.carts[0]!.url).toBe("https://www.walmart.com/sc/cart/addToCart?items=10450114_2,51259212_1");
  });

  it("builds an Amazon link with numbered ASINs and no Associate tag", () => {
    const plan = buildCartPlan([line(amazon("B07XJ8C8F5"), 3), line(amazon("B000000001"))]);
    const url = plan.carts[0]!.url;
    expect(url).toBe(
      "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07XJ8C8F5&Quantity.1=3&ASIN.2=B000000001&Quantity.2=1",
    );
    expect(url).not.toContain("tag=");
  });

  it("makes one cart per store, Walmart first", () => {
    const plan = buildCartPlan([line(amazon("B07XJ8C8F5")), line(walmart("10450114"))]);
    expect(plan.carts.map((c) => c.store)).toEqual(["walmart", "amazon"]);
  });

  it("leaves unlinked groceries out of every link", () => {
    const loose = line(null, 2);
    const plan = buildCartPlan([line(walmart("10450114")), loose]);
    expect(plan.unlinked).toEqual([loose]);
    expect(plan.carts[0]!.url).toBe("https://www.walmart.com/sc/cart/addToCart?items=10450114_1");
  });

  it("leaves out product IDs the store would reject", () => {
    const bad = line(walmart("abc"));
    const badAsin = line(amazon("B07"));
    const plan = buildCartPlan([bad, badAsin, line(walmart("10450114"))]);
    expect(plan.invalid).toEqual([bad, badAsin]);
    expect(plan.carts).toHaveLength(1);
  });

  it("adds up two lines for the same product", () => {
    const plan = buildCartPlan([line(walmart("10450114"), 1), line(walmart("10450114"), 2)]);
    expect(plan.carts[0]!.url).toBe("https://www.walmart.com/sc/cart/addToCart?items=10450114_3");
  });

  it("drops lines with nothing to buy", () => {
    const plan = buildCartPlan([line(walmart("10450114"), 0), line(null, 0)]);
    expect(plan).toEqual({ carts: [], unlinked: [], invalid: [] });
  });

  it("rounds packages to whole numbers but keeps pounds for deli products", () => {
    const plan = buildCartPlan([line(walmart("10450114"), 1.4), line(walmart("22222222", "pound"), 1.5)]);
    expect(plan.carts[0]!.url).toBe("https://www.walmart.com/sc/cart/addToCart?items=10450114_1,22222222_1.5");
  });
});
