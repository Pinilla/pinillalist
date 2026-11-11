import { describe, expect, it } from "vitest";
import { filterRecipes, toggleCollection } from "./filters.ts";

const recipes = [
  { name: "Chili", collectionIds: [1] },
  { name: "Tacos", collectionIds: [1, 2] },
  { name: "Cookies", collectionIds: [3] },
  { name: "Soup", collectionIds: [] },
];
const names = (chosen: number[], query = "") => filterRecipes(recipes, chosen, query).map((r) => r.name);

describe("recipe filters", () => {
  it("shows everything when no collection is chosen", () => {
    expect(names([])).toEqual(["Chili", "Tacos", "Cookies", "Soup"]);
  });

  it("shows recipes in any of the chosen collections", () => {
    expect(names([1])).toEqual(["Chili", "Tacos"]);
    expect(names([2, 3])).toEqual(["Tacos", "Cookies"]);
  });

  it("narrows the chosen collections by the search text", () => {
    expect(names([1, 3], "c")).toEqual(["Chili", "Tacos", "Cookies"]);
    expect(names([1, 3], "co")).toEqual(["Tacos", "Cookies"]);
  });

  it("turns one chip on or off without touching the others", () => {
    expect(toggleCollection([], 1)).toEqual([1]);
    expect(toggleCollection([1], 3)).toEqual([1, 3]);
    expect(toggleCollection([1, 3], 1)).toEqual([3]);
  });
});
