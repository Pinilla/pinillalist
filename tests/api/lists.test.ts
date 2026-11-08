import { describe, expect, it } from "vitest";
import { createList } from "../../src/server/repo.ts";
import { setup } from "./helpers.ts";

describe("lists", () => {
  it("makes the first grocery list the default", async () => {
    const { call } = await setup();
    const { body: a } = await call("POST", "/api/lists", { name: "Walmart" });
    const { body: b } = await call("POST", "/api/lists", { name: "Costco" });
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
    await call("PATCH", `/api/lists/${b.id}`, { isDefault: true });
    const { body: lists } = await call("GET", "/api/lists");
    expect(lists.map((l: { name: string; isDefault: boolean }) => [l.name, l.isDefault])).toEqual([
      ["Costco", true],
      ["Walmart", false],
    ]);
  });

  it("adds an item by name, creating the grocery, and adds amounts for a repeat", async () => {
    const { call } = await setup();
    const { body: list } = await call("POST", "/api/lists", { name: "Groceries" });
    await call("POST", `/api/lists/${list.id}/items`, { groceryName: "Bananas", amount: 3 });
    const { body } = await call("POST", `/api/lists/${list.id}/items`, { groceryName: "banana", amount: 2 });
    expect(body.items).toEqual([expect.objectContaining({ groceryName: "Bananas", amount: 5 })]);
  });

  it("ticks items off and clears the done ones", async () => {
    const { call } = await setup();
    const { body: list } = await call("POST", "/api/lists", { name: "Groceries" });
    const { body: withItem } = await call("POST", `/api/lists/${list.id}/items`, { groceryName: "Milk" });
    const { body: ticked } = await call("PATCH", `/api/list-items/${withItem.items[0].id}`, { done: true });
    expect(ticked.items[0].done).toBe(true);
    expect((await call("POST", `/api/lists/${list.id}/clear-done`)).body.items).toEqual([]);
  });

  it("never marks an Essentials item done and won't delete the Essentials list", async () => {
    const { db, call } = await setup();
    const essentials = createList(db, "Weekly Essentials", "essentials");
    const { body } = await call("POST", `/api/lists/${essentials.id}/items`, { groceryName: "Toilet paper" });
    const { body: after } = await call("PATCH", `/api/list-items/${body.items[0].id}`, { done: true });
    expect(after.items[0].done).toBe(false);
    expect((await call("DELETE", `/api/lists/${essentials.id}`)).status).toBe(409);
  });

  it("returns 404 for an unknown list", async () => {
    const { call } = await setup();
    expect((await call("POST", "/api/lists/999/items", { groceryName: "Milk" })).status).toBe(404);
  });
});
