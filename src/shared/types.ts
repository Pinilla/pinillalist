import type { LocationKey } from "./locations.ts";

export type Store = "walmart" | "amazon";

export const STORES: Store[] = ["walmart", "amazon"];

export const STORE_NAMES: Record<Store, string> = {
  walmart: "Walmart",
  amazon: "Amazon",
};

/** How a product is sold. "pound" means a cart quantity of 1 adds 1 lb (sliced-to-order deli). */
export type SoldBy = "each" | "pound";

export interface Product {
  store: Store;
  storeId: string;
  name: string;
  size: string;
  imageUrl: string;
  soldBy: SoldBy;
}

export interface Grocery {
  id: number;
  name: string;
  unit: string;
  /** Where the household keeps it. Null until someone sets it. */
  location: LocationKey | null;
  product: Product | null;
}

export type IngredientRow =
  | { kind: "heading"; id: number; text: string }
  | {
      kind: "ingredient";
      id: number;
      groceryId: number;
      groceryName: string;
      cookingAmount: string;
      preparation: string;
      /** Left out of the weekly order unless someone picks it along with the recipe. */
      optional: boolean;
      /** The recipe this ingredient is made from, if it's made at home. The grocery is what to buy instead. */
      subRecipe: { id: number; name: string } | null;
    };

export interface RecipeSummary {
  id: number;
  name: string;
  photo: string | null;
  collectionIds: number[];
  /** True when the recipe has optional ingredients or uses another recipe, so picking it asks about them. */
  hasExtras: boolean;
}

export interface Recipe extends RecipeSummary {
  servings: string;
  prepTime: number | null;
  cookTime: number | null;
  steps: string[];
  note: string;
  sourceName: string;
  sourceUrl: string;
  rating: number | null;
  ingredients: IngredientRow[];
}

export interface Collection {
  id: number;
  name: string;
}

export interface ListItem {
  id: number;
  groceryId: number;
  groceryName: string;
  amount: number | null;
  details: string;
  done: boolean;
}

export interface GroceryList {
  id: number;
  name: string;
  kind: "essentials" | "grocery";
  isDefault: boolean;
  items: ListItem[];
}
