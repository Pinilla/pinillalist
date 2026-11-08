import { describe, expect, it } from "vitest";
import { recipeBody, setup } from "./helpers.ts";

describe("catalog", () => {
  it("adds a grocery once, matching names regardless of case and plurals", async () => {
    const { call } = await setup();
    const first = await call("POST", "/api/groceries", { name: "Onions", unit: "" });
    expect(first.status).toBe(201);
    const again = await call("POST", "/api/groceries", { name: "onion" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
  });

  it("links a product from a pasted Walmart link", async () => {
    const { call } = await setup();
    const { body: g } = await call("POST", "/api/groceries", { name: "Milk" });
    const res = await call("PUT", `/api/groceries/${g.id}/product`, {
      link: "https://www.walmart.com/ip/Great-Value-Whole-Milk-1-Gallon/10450114?sid=abc",
      name: "Great Value Whole Milk",
      size: "1 gal",
    });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ store: "walmart", storeId: "10450114", name: "Great Value Whole Milk", soldBy: "each" });
  });

  it("links a product from a pasted Amazon link", async () => {
    const { call } = await setup();
    const { body: g } = await call("POST", "/api/groceries", { name: "Diapers" });
    const res = await call("PUT", `/api/groceries/${g.id}/product`, { link: "https://www.amazon.com/x/dp/B07XJ8C8F5/ref=1", name: "Huggies" });
    expect(res.body.product).toMatchObject({ store: "amazon", storeId: "B07XJ8C8F5" });
  });

  it("rejects a link it can't read", async () => {
    const { call } = await setup();
    const { body: g } = await call("POST", "/api/groceries", { name: "Milk" });
    const res = await call("PUT", `/api/groceries/${g.id}/product`, { link: "https://www.walmart.com/search?q=milk" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\/ip\//);
  });

  it("only lets Walmart products be sold by the pound", async () => {
    const { call } = await setup();
    const { body: g } = await call("POST", "/api/groceries", { name: "Cheese" });
    const res = await call("PUT", `/api/groceries/${g.id}/product`, { link: "https://www.amazon.com/dp/B07XJ8C8F5", soldBy: "pound" });
    expect(res.status).toBe(400);
  });

  it("refuses to rename a grocery to one that exists", async () => {
    const { call } = await setup();
    await call("POST", "/api/groceries", { name: "Onion" });
    const { body: g } = await call("POST", "/api/groceries", { name: "Yellow onion" });
    expect((await call("PATCH", `/api/groceries/${g.id}`, { name: "onions" })).status).toBe(409);
  });

  it("merges a grocery into another, moving its ingredients, list items and product", async () => {
    const { call } = await setup();
    const { body: recipe } = await call(
      "POST",
      "/api/recipes",
      recipeBody("Chili", [{ kind: "ingredient", groceryName: "Yellow onion", cookingAmount: "1", buyingAmount: 1 }]),
    );
    const yellowId = recipe.ingredients[0].groceryId;
    await call("PUT", `/api/groceries/${yellowId}/product`, { link: "https://www.walmart.com/ip/51259212" });
    const { body: onion } = await call("POST", "/api/groceries", { name: "Onion" });
    const { body: lists } = await call("GET", "/api/lists");
    const { body: list } = await call("POST", "/api/lists", { name: "Groceries" });
    expect(lists).toEqual([]);
    await call("POST", `/api/lists/${list.id}/items`, { groceryId: yellowId, amount: 1 });
    await call("POST", `/api/lists/${list.id}/items`, { groceryId: onion.id, amount: 2 });

    const merged = await call("POST", `/api/groceries/${yellowId}/merge`, { intoId: onion.id });
    expect(merged.status).toBe(200);
    expect(merged.body.product.storeId).toBe("51259212");

    const { body: after } = await call("GET", `/api/recipes/${recipe.id}`);
    expect(after.ingredients[0].groceryName).toBe("Onion");
    const { body: listsAfter } = await call("GET", "/api/lists");
    expect(listsAfter[0].items).toEqual([expect.objectContaining({ groceryId: onion.id, amount: 3 })]);
    expect((await call("GET", "/api/groceries")).body.map((g: { name: string }) => g.name)).toEqual(["Onion"]);
  });

  it("won't delete a grocery a recipe uses", async () => {
    const { call } = await setup();
    const { body: recipe } = await call("POST", "/api/recipes", recipeBody("Soup", [{ kind: "ingredient", groceryName: "Leek" }]));
    expect((await call("DELETE", `/api/groceries/${recipe.ingredients[0].groceryId}`)).status).toBe(409);
  });

  it("lists merge suggestions and lets the owner keep them apart", async () => {
    const { db, call } = await setup();
    const { body: a } = await call("POST", "/api/groceries", { name: "Onion" });
    const { body: b } = await call("POST", "/api/groceries", { name: "Yellow onion" });
    const { addMergeSuggestion } = await import("../../src/server/repo.ts");
    addMergeSuggestion(db, a.id, b.id);
    const { body: suggestions } = await call("GET", "/api/merge-suggestions");
    expect(suggestions).toEqual([{ id: expect.any(Number), a: expect.objectContaining({ name: "Onion" }), b: expect.objectContaining({ name: "Yellow onion" }) }]);
    await call("POST", `/api/merge-suggestions/${suggestions[0].id}/keep`);
    expect((await call("GET", "/api/merge-suggestions")).body).toEqual([]);
  });
});
