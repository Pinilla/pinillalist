import { describe, expect, it } from "vitest";
import { recipeBody, setup } from "./helpers.ts";

describe("recipes", () => {
  it("creates a recipe with headings and ingredients, adding groceries to the catalog", async () => {
    const { call } = await setup();
    const { body: col } = await call("POST", "/api/collections", { name: "Easy Dinner" });
    const res = await call(
      "POST",
      "/api/recipes",
      recipeBody(
        "Tacos",
        [
          { kind: "heading", text: "Filling" },
          { kind: "ingredient", groceryName: "Ground beef", cookingAmount: "1 lb", preparation: "", buyingAmount: 1 },
          { kind: "ingredient", groceryName: "Onion", cookingAmount: "1", preparation: "diced", buyingAmount: 1 },
        ],
        { collectionIds: [col.id], steps: ["Brown the beef.", "  ", "Add onion."], prepTime: 600 },
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.steps).toEqual(["Brown the beef.", "Add onion."]);
    expect(res.body.collectionIds).toEqual([col.id]);
    expect(res.body.ingredients.map((i: { kind: string }) => i.kind)).toEqual(["heading", "ingredient", "ingredient"]);
    expect(res.body.ingredients[2]).toMatchObject({ groceryName: "Onion", preparation: "diced", buyingAmount: 1 });
    expect((await call("GET", "/api/groceries")).body).toHaveLength(2);
  });

  it("returns several full recipes in the order asked", async () => {
    const { call } = await setup();
    const { body: a } = await call("POST", "/api/recipes", recipeBody("A", []));
    const { body: b } = await call("POST", "/api/recipes", recipeBody("B", []));
    const { body } = await call("GET", `/api/recipes?ids=${b.id},${a.id}`);
    expect(body.map((r: { name: string }) => r.name)).toEqual(["B", "A"]);
  });

  it("sets an ingredient's buying amount from the stock check", async () => {
    const { call } = await setup();
    const { body: r } = await call("POST", "/api/recipes", recipeBody("Rub", [{ kind: "ingredient", groceryName: "Cumin", cookingAmount: "1 tsp" }]));
    const ingId = r.ingredients[0].id;
    expect((await call("PATCH", `/api/ingredients/${ingId}`, { buyingAmount: 1 })).status).toBe(204);
    expect((await call("GET", `/api/recipes/${r.id}`)).body.ingredients[0].buyingAmount).toBe(1);
  });

  it("replaces a recipe's ingredients on save", async () => {
    const { call } = await setup();
    const { body: r } = await call("POST", "/api/recipes", recipeBody("Soup", [{ kind: "ingredient", groceryName: "Leek" }]));
    const { body: saved } = await call("PUT", `/api/recipes/${r.id}`, recipeBody("Soup", [{ kind: "ingredient", groceryName: "Carrot" }]));
    expect(saved.ingredients.map((i: { groceryName: string }) => i.groceryName)).toEqual(["Carrot"]);
  });

  it("rejects a recipe without a name", async () => {
    const { call } = await setup();
    expect((await call("POST", "/api/recipes", recipeBody("  ", []))).status).toBe(409);
  });

  it("rejects a negative buying amount", async () => {
    const { call } = await setup();
    const res = await call("POST", "/api/recipes", recipeBody("X", [{ kind: "ingredient", groceryName: "Leek", buyingAmount: -1 }]));
    expect(res.status).toBe(400);
  });

  it("deletes a recipe", async () => {
    const { call } = await setup();
    const { body: r } = await call("POST", "/api/recipes", recipeBody("Gone", []));
    expect((await call("DELETE", `/api/recipes/${r.id}`)).status).toBe(204);
    expect((await call("GET", `/api/recipes/${r.id}`)).status).toBe(404);
  });

  it("stores an uploaded photo and serves it", async () => {
    const { app, cookie, call } = await setup();
    const { body: r } = await call("POST", "/api/recipes", recipeBody("Pic", []));
    const form = new FormData();
    form.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }));
    const res = await app.request(`/api/recipes/${r.id}/photo`, { method: "PUT", body: form, headers: { cookie } });
    expect(res.status).toBe(200);
    const { photo } = await res.json();
    expect(photo).toMatch(/\.jpg$/);
    const img = await app.request(`/photos/${photo}`, { headers: { cookie } });
    expect(img.status).toBe(200);
    expect((await app.request(`/photos/${photo}`)).status).toBe(302);
  });
});
