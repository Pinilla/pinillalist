import type { RecipeSummary } from "./types.ts";

/** Turns one collection chip on or off, leaving the others as they are. */
export function toggleCollection(chosen: number[], id: number): number[] {
  return chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
}

/**
 * The recipes in any of the chosen collections (all of them when none is
 * chosen) whose name contains the search text.
 */
export function filterRecipes<T extends Pick<RecipeSummary, "name" | "collectionIds">>(recipes: T[], chosen: number[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return recipes.filter(
    (r) => (chosen.length === 0 || r.collectionIds.some((id) => chosen.includes(id))) && (!q || r.name.toLowerCase().includes(q)),
  );
}
