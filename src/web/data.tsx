import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Collection, Grocery, GroceryList, RecipeSummary } from "../shared/types.ts";
import { api } from "./api.ts";

interface Data {
  groceries: Grocery[];
  groceryById: Map<number, Grocery>;
  recipes: RecipeSummary[];
  collections: Collection[];
  lists: GroceryList[];
  loaded: boolean;
  error: string | null;
  reload: (what?: Array<"groceries" | "recipes" | "collections" | "lists">) => Promise<void>;
  setGrocery: (g: Grocery) => void;
  setList: (l: GroceryList) => void;
}

const DataContext = createContext<Data | null>(null);

/** Loads the household's shared data once and lets screens refresh the parts they change. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (what = ["groceries", "recipes", "collections", "lists"] as const as Array<"groceries" | "recipes" | "collections" | "lists">) => {
    try {
      await Promise.all(
        what.map(async (w) => {
          if (w === "groceries") setGroceries(await api.get<Grocery[]>("/api/groceries"));
          if (w === "recipes") setRecipes(await api.get<RecipeSummary[]>("/api/recipes"));
          if (w === "collections") setCollections(await api.get<Collection[]>("/api/collections"));
          if (w === "lists") setLists(await api.get<GroceryList[]>("/api/lists"));
        }),
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Pick up the other phone's changes when this one comes back to the app.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const value = useMemo<Data>(
    () => ({
      groceries,
      groceryById: new Map(groceries.map((g) => [g.id, g])),
      recipes,
      collections,
      lists,
      loaded,
      error,
      reload,
      setGrocery: (g) =>
        setGroceries((all) => {
          const next = all.some((x) => x.id === g.id) ? all.map((x) => (x.id === g.id ? g : x)) : [...all, g];
          return next.sort((a, b) => a.name.localeCompare(b.name));
        }),
      setList: (l) => setLists((all) => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [...all, l])),
    }),
    [groceries, recipes, collections, lists, loaded, error, reload],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error("useData needs a DataProvider");
  return data;
}
