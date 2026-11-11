import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDb, openDb } from "../../src/server/db/index.ts";
import { getRecipes, listGroceries, listLists, listMergeSuggestions, listRecipes } from "../../src/server/repo.ts";
import { importAnyList } from "./import.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture() {
  return {
    recipeDataResponse: {
      recipes: [
        {
          identifier: "r1",
          name: "Chili",
          photoIds: ["p1"],
          prepTime: 600,
          cookTime: 0,
          preparationSteps: ["Brown the beef.", ""],
          ingredients: [
            { isHeading: true, name: "Base" },
            { name: "Ground Beef", quantity: "2 lb", note: "", rawIngredient: "2 lb Ground Beef" },
            { name: "onions", quantity: "2", note: "(diced)", rawIngredient: "2 onions (diced)" },
            { name: "chili powder", quantity: "2 tbsp", note: "", rawIngredient: "2 tbsp chili powder" },
          ],
        },
        {
          identifier: "r2",
          name: "Tacos",
          ingredients: [
            { name: "onion", quantity: "1 cup", note: "", rawIngredient: "1 cup onion" },
            { name: "yellow onion", quantity: "1", note: "", rawIngredient: "1 yellow onion" },
          ],
        },
      ],
      recipeCollections: [{ identifier: "c1", name: "Easy Dinner", recipeIds: ["r1", "r2"] }],
    },
    shoppingListsResponse: {
      newLists: [
        { name: "Weekly Essentials", items: [{ name: "Toilet Paper", details: "Extra roll in closet" }, { name: "Onion" }] },
        { name: "Quick Things", items: [{ name: "Hang art" }] },
        { name: "Store", items: [{ name: "Kettle" }] },
      ],
    },
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "pinillalist-import-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "export"));
  writeFileSync(path.join(dir, "export", "r1-0.jpg"), "jpeg");
  const db = openDb(path.join(dir, "test.db"));
  migrateDb(db);
  return { db, opts: { photosFrom: path.join(dir, "export"), photosTo: path.join(dir, "photos") }, dir };
}

describe("importAnyList", () => {
  it("imports recipes, collections, photos and the catalog", () => {
    const { db, opts, dir } = setup();
    const report = importAnyList(db, fixture(), opts);
    expect(report).toMatchObject({ recipes: 2, collections: 1, photos: 1, ingredients: 5, essentials: 2 });

    const [chili] = getRecipes(db, [listRecipes(db).find((r) => r.name === "Chili")!.id]);
    expect(chili!.photo).toBe("r1-0.jpg");
    expect(existsSync(path.join(dir, "photos", "r1-0.jpg"))).toBe(true);
    expect(chili!.prepTime).toBe(600);
    expect(chili!.cookTime).toBeNull();
    expect(chili!.steps).toEqual(["Brown the beef."]);
    expect(chili!.collectionIds).toHaveLength(1);
    expect(chili!.ingredients.map((i) => (i.kind === "heading" ? `# ${i.text}` : `${i.groceryName}|${i.cookingAmount}|${i.preparation}`))).toEqual([
      "# Base",
      "Ground Beef|2 lb|",
      "Onions|2|diced",
      "Chili powder|2 tbsp|",
    ]);
  });

  it("matches the same grocery across recipes and gives it a unit from its uses", () => {
    const { db, opts } = setup();
    importAnyList(db, fixture(), opts);
    const names = listGroceries(db).map((g) => `${g.name}|${g.unit}`);
    expect(names).toEqual(["Chili powder|", "Ground Beef|lb", "Onions|", "Toilet Paper|", "Yellow onion|"]);
  });

  it("brings over only the Essentials list, with details", () => {
    const { db, opts } = setup();
    const report = importAnyList(db, fixture(), opts);
    const lists = listLists(db);
    expect(lists.map((l) => [l.name, l.kind])).toEqual([["Weekly Essentials", "essentials"]]);
    expect(lists[0]!.items.map((i) => [i.groceryName, i.details])).toEqual([
      ["Toilet Paper", "Extra roll in closet"],
      ["Onions", ""],
    ]);
    expect(report.skippedLists).toEqual(["Quick Things (1 items)", "Store (1 items)"]);
  });

  it("suggests near-duplicates for the owner to review", () => {
    const { db, opts } = setup();
    importAnyList(db, fixture(), opts);
    expect(listMergeSuggestions(db).map((s) => [s.a.name, s.b.name])).toEqual([["Onions", "Yellow onion"]]);
  });

  it("refuses to run twice", () => {
    const { db, opts } = setup();
    importAnyList(db, fixture(), opts);
    expect(() => importAnyList(db, fixture(), opts)).toThrow(/only runs once/);
  });
});
