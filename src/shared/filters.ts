import type { RecipeSummary } from "./types.ts";

export function toggleCollection(chosen: number[], id: number): number[] {
  return chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
}

export function filterRecipes<T extends Pick<RecipeSummary, "name" | "collectionIds">>(
  recipes: T[],
  chosen: number[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return recipes.filter(
    (r) =>
      (chosen.length === 0 || r.collectionIds.some((id) => chosen.includes(id))) &&
      (!q || r.name.toLowerCase().includes(q)),
  );
}
