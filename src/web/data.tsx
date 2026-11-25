import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Collection, Grocery, GroceryList, Recipe, RecipeSummary } from "../shared/types.ts";
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (
      what = ["groceries", "recipes", "collections", "lists"] as const as Array<
        "groceries" | "recipes" | "collections" | "lists"
      >,
    ) => {
      try {
        await Promise.all(
          what.map(async (w) => {
            if (w === "groceries") {
              setGroceries(await api.get<Grocery[]>("/api/groceries"));
            }
            if (w === "recipes") {
              setRecipes(await api.get<RecipeSummary[]>("/api/recipes"));
            }
            if (w === "collections") {
              setCollections(await api.get<Collection[]>("/api/collections"));
            }
            if (w === "lists") {
              setLists(await api.get<GroceryList[]>("/api/lists"));
            }
          }),
        );
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoaded(true);
      }
    },
    [],
  );

  useReloadOnReturn(reload);

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
        setGroceries((all) => replaceById(all, g).sort((a, b) => a.name.localeCompare(b.name))),
      setList: (l) => setLists((all) => replaceById(all, l)),
    }),
    [groceries, recipes, collections, lists, loaded, error, reload],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useReloadOnReturn(reload: () => Promise<void>) {
  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);
}

function replaceById<T extends { id: number }>(all: T[], item: T): T[] {
  return all.some((x) => x.id === item.id)
    ? all.map((x) => (x.id === item.id ? item : x))
    : [...all, item];
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) {
    throw new Error("useData needs a DataProvider");
  }
  return data;
}

export function useRecipe(id: number | null) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id === null) {
      return;
    }
    let live = true;
    api
      .get<Recipe>(`/api/recipes/${id}`)
      .then((r) => live && setRecipe(r))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [id]);
  return { recipe, error };
}
