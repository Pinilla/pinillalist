// Starts the app on a throwaway database with a few known recipes and products, for Playwright.
import { serve } from "@hono/node-server";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../src/server/app.ts";
import { setPassword } from "../../src/server/auth.ts";
import { migrateDb, openDb } from "../../src/server/db/index.ts";
import * as repo from "../../src/server/repo.ts";
import type { Product } from "../../src/shared/types.ts";

export const PASSWORD = "e2e household password";

const dir = mkdtempSync(path.join(tmpdir(), "pinillalist-e2e-"));
const db = openDb(path.join(dir, "e2e.db"));
migrateDb(db);
setPassword(db, PASSWORD);

const dinner = repo.createCollection(db, "Easy Dinner");
repo.createCollection(db, "Desserts");
const ing = (groceryName: string, cookingAmount: string, buyingAmount: number | null, preparation = "") =>
  ({ kind: "ingredient", groceryName, cookingAmount, preparation, buyingAmount }) as const;
const base = { servings: "", prepTime: null, cookTime: null, steps: [], note: "", sourceName: "", sourceUrl: "", rating: null };

repo.createRecipe(db, {
  ...base,
  name: "Chili",
  collectionIds: [dinner.id],
  steps: ["Brown the beef.", "Add everything else."],
  ingredients: [ing("Onion", "2", 2, "diced"), ing("Ground beef", "1 lb", 1), ing("Cumin", "1 tsp", null)],
});
repo.createRecipe(db, {
  ...base,
  name: "Tacos",
  collectionIds: [dinner.id],
  ingredients: [ing("Onion", "1", 1), ing("Tortillas", "8", 1)],
});
repo.createRecipe(db, { ...base, name: "Cookies", collectionIds: [], ingredients: [ing("Flour", "2 cups", null)] });

const product = (store: Product["store"], storeId: string, name: string, soldBy: Product["soldBy"] = "each"): Product => ({
  store, storeId, name, size: "", imageUrl: "", soldBy,
});
const link = (name: string, p: Product, unit = "") => {
  const { grocery } = repo.findOrCreateGrocery(db, name, unit);
  if (unit) repo.updateGrocery(db, grocery.id, { unit });
  repo.setProduct(db, grocery.id, p);
};
link("Onion", product("walmart", "51259212", "Yellow onions, 3 lb bag"));
link("Ground beef", product("walmart", "10450114", "Ground beef 80/20"), "lb");
link("Tortillas", product("amazon", "B07XJ8C8F5", "Flour tortillas"), "pack");

const essentials = repo.createList(db, "Weekly Essentials", "essentials");
repo.addListItem(db, essentials.id, { groceryName: "Toilet paper", details: "Extra roll in the closet" });
repo.addListItem(db, essentials.id, { groceryName: "Deli American cheese" });
link("Toilet paper", product("amazon", "B000000001", "Toilet paper 24 rolls"));
link("Deli American cheese", product("walmart", "22222222", "Deli American cheese", "pound"));

const app = createApp({ db, photosDir: path.join(dir, "photos"), distDir: path.resolve("dist") });
const port = Number(process.env.PORT ?? 3199);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(`e2e server on ${port}, data in ${dir}`));
