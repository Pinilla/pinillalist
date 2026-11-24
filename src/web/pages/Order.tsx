import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { formatNumber } from "../../shared/amounts.ts";
import type { OrderLine, StoreCart } from "../../shared/carts.ts";
import { filterRecipes } from "../../shared/filters.ts";
import { locationLabel } from "../../shared/locations.ts";
import { defaultMode, subRecipeIds, type SubRecipeMode } from "../../shared/merge.ts";
import {
  STEPS,
  loadOrder,
  planOrder,
  updateOrder,
  type OrderAction,
  type OrderPlan,
  type OrderState,
  type RecipeChoice,
} from "../../shared/order.ts";
import type { CheckItem } from "../../shared/stock.ts";
import { STORE_NAMES, type Grocery, type IngredientRow, type ListItem, type Product, type Recipe, type RecipeSummary } from "../../shared/types.ts";
import { api } from "../api.ts";
import { CollectionChips, Stepper, StoreBadge, Thumb, productLabel, toast, useDesktop } from "../components.tsx";
import { useData, useRecipe } from "../data.tsx";

const STORAGE_KEY = "pinillalist.order";

type Dispatch = (action: OrderAction) => void;
type StepProps = { state: OrderState; dispatch: Dispatch };

export function OrderPage() {
  const { groceryById, lists, loaded } = useData();
  const [state, setState] = useSavedOrder();
  const picked = usePickedRecipes(state.recipeIds);
  const essentials = useMemo(() => essentialItems(lists), [lists]);
  const plan = useMemo(
    () => planOrder(state, { recipes: picked.recipes, subRecipes: picked.subRecipes, essentials, groceries: groceryById }),
    [state, picked, essentials, groceryById],
  );
  const dispatch: Dispatch = (action) => setState((s) => updateOrder(s, action, plan.check));
  useCardsChanged(plan.check, dispatch);

  if (!loaded) return <main className="wrap empty">Loading…</main>;

  const goToStep = (step: number) => {
    dispatch({ type: "goToStep", step });
    window.scrollTo(0, 0);
  };

  return (
    <main className={orderClassName(state.step)}>
      <OrderHeader step={state.step} onStep={goToStep} />
      <div className="stack step-body">
        {state.step === 0 && <PickRecipes state={state} dispatch={dispatch} />}
        {state.step === 1 && (picked.loading ? <p className="empty">Loading the recipes…</p> : <StockCheck state={state} dispatch={dispatch} plan={plan} />)}
        {state.step === 2 && <AnythingElse state={state} dispatch={dispatch} />}
        {state.step === 3 && <FillCarts state={state} dispatch={dispatch} plan={plan} />}
      </div>
      <StepNav step={state.step} onStep={goToStep} />
    </main>
  );
}

function useSavedOrder() {
  const [state, setStateRaw] = useState<OrderState>(() => loadOrder(readSaved()));
  const setState = (update: (s: OrderState) => OrderState) =>
    setStateRaw((s) => {
      const next = update(s);
      if (next !== s) save(next);
      return next;
    });
  return [state, setState] as const;
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(state: OrderState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

function usePickedRecipes(recipeIds: number[]) {
  const idsKey = recipeIds.join(",");
  const [loadedFor, setLoadedFor] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [subRecipes, setSubRecipes] = useState<Map<number, Recipe>>(new Map());

  useEffect(() => {
    if (!idsKey) {
      setRecipes([]);
      setSubRecipes(new Map());
      setLoadedFor("");
      return;
    }
    let live = true;
    fetchWithSubRecipes(idsKey)
      .then(({ picked, subs }) => {
        if (!live) return;
        setRecipes(picked);
        setSubRecipes(new Map(subs.map((r) => [r.id, r])));
        setLoadedFor(idsKey);
      })
      .catch((err: Error) => toast(err.message));
    return () => {
      live = false;
    };
  }, [idsKey]);

  return useMemo(() => ({ recipes, subRecipes, loading: idsKey !== "" && loadedFor !== idsKey }), [recipes, subRecipes, idsKey, loadedFor]);
}

async function fetchWithSubRecipes(idsKey: string) {
  const picked = await api.get<Recipe[]>(`/api/recipes?ids=${idsKey}`);
  const subIds = subRecipeIds(picked);
  const subs = subIds.length ? await api.get<Recipe[]>(`/api/recipes?ids=${subIds.join(",")}`) : [];
  return { picked, subs };
}

function useCardsChanged(check: CheckItem[], dispatch: Dispatch) {
  const checkKey = check.map((c) => c.groceryId).join(",");
  useEffect(() => {
    dispatch({ type: "cardsChanged" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);
}

function essentialItems(lists: { kind: string; items: ListItem[] }[]): ListItem[] {
  return lists.find((l) => l.kind === "essentials")?.items ?? [];
}

function orderClassName(step: number): string {
  const pick = step === 0 ? " pick-step" : "";
  const narrow = step >= 1 && step <= 2 ? " narrow-step" : "";
  return `wrap stack order${pick}${narrow}`;
}

function OrderHeader({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <div>
      <div className="row between">
        <span className="label">
          Step {step + 1} of {STEPS.length}
        </span>
        <span className="label">Weekly order</span>
      </div>
      <div className="steps" role="tablist" aria-label="Steps">
        {STEPS.map((name, i) => (
          <button key={name} role="tab" aria-selected={i === step} aria-label={name} className={i <= step ? "done" : ""} onClick={() => onStep(i)}>
            <span className="step-name">
              {i + 1}. {name}
            </span>
          </button>
        ))}
      </div>
      <h1>{STEPS[step]}</h1>
    </div>
  );
}

function StepNav({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <div className="sticky-foot">
      <div className="row nowrap">
        {step > 0 && (
          <button className="btn ghost" onClick={() => onStep(step - 1)}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button className="btn grow" onClick={() => onStep(step + 1)}>
            Next: {STEPS[step + 1]}
          </button>
        )}
      </div>
    </div>
  );
}

function PickRecipes({ state, dispatch }: StepProps) {
  const { recipes, collections } = useData();
  const desktop = useDesktop();
  const [query, setQuery] = useState("");
  const [sheetFor, setSheetFor] = useState<RecipeSummary | null>(null);
  const nameOf = recipeNamer(recipes);
  const unpick = (recipeId: number) => dispatch({ type: "unpickRecipe", recipeId });
  const tap = (r: RecipeSummary) => (r.hasExtras ? setSheetFor(r) : dispatch({ type: "toggleRecipe", recipeId: r.id }));

  return (
    <div className="stack pick">
      <div className="stack">
        {!desktop && <PickedStrip recipeIds={state.recipeIds} nameOf={nameOf} onUnpick={unpick} />}
        <p className="muted">{pickHint(state.recipeIds.length)}</p>
        <input type="search" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
        <CollectionChips
          collections={collections}
          chosen={state.collectionFilters}
          onChange={(collectionIds) => dispatch({ type: "filterCollections", collectionIds })}
        />
        <RecipeGrid recipes={filterRecipes(recipes, state.collectionFilters, query)} pickedIds={state.recipeIds} onTap={tap} />
      </div>
      {desktop && <PickedAside recipeIds={state.recipeIds} nameOf={nameOf} onUnpick={unpick} />}
      {sheetFor && (
        <ExtrasSheet
          summary={sheetFor}
          choice={state.choices[sheetFor.id]}
          onSave={(choice) => {
            dispatch({ type: "pickRecipe", recipeId: sheetFor.id, choice });
            setSheetFor(null);
          }}
          onUnpick={
            state.recipeIds.includes(sheetFor.id)
              ? () => {
                  unpick(sheetFor.id);
                  setSheetFor(null);
                }
              : undefined
          }
          onClose={() => setSheetFor(null)}
        />
      )}
    </div>
  );
}

function recipeNamer(recipes: RecipeSummary[]): (id: number) => string {
  const names = new Map(recipes.map((r) => [r.id, r.name]));
  return (id) => names.get(id) ?? "Deleted recipe";
}

function pickHint(count: number): string {
  return count === 0 ? "Tap the recipes you'll cook this week." : `${count} chosen. Tap again to unpick.`;
}

type PickedListProps = { recipeIds: number[]; nameOf: (id: number) => string; onUnpick: (id: number) => void };

function PickedStrip({ recipeIds, nameOf, onUnpick }: PickedListProps) {
  if (recipeIds.length === 0) return null;
  return (
    <section className="picked-strip" aria-label="This week">
      {recipeIds.map((id) => (
        <span key={id} className="pchip">
          <span>{nameOf(id)}</span>
          <button aria-label={`Unpick ${nameOf(id)}`} onClick={() => onUnpick(id)}>
            ×
          </button>
        </span>
      ))}
    </section>
  );
}

function PickedAside({ recipeIds, nameOf, onUnpick }: PickedListProps) {
  return (
    <aside className="storebox chosen" aria-label="Picked recipes">
      <h2>This week</h2>
      {recipeIds.length === 0 ? (
        <p className="muted small">Nothing picked yet.</p>
      ) : (
        <div className="list">
          {recipeIds.map((id) => (
            <div key={id} className="li">
              <span className="grow name">{nameOf(id)}</span>
              <button className="btn plain small" aria-label={`Unpick ${nameOf(id)}`} onClick={() => onUnpick(id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function RecipeGrid({ recipes, pickedIds, onTap }: { recipes: RecipeSummary[]; pickedIds: number[]; onTap: (r: RecipeSummary) => void }) {
  if (recipes.length === 0) return <p className="empty">No recipes here.</p>;
  return (
    <div className="grid">
      {recipes.map((r) => {
        const on = pickedIds.includes(r.id);
        return (
          <button key={r.id} className={`tile${on ? " on" : ""}`} aria-pressed={on} onClick={() => onTap(r)}>
            <Thumb photo={r.photo} name={r.name} className="tile-img" />
            <span className="t">{r.name}</span>
            {on && (
              <span className="mark" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type IngredientLine = Extract<IngredientRow, { kind: "ingredient" }>;

function ExtrasSheet({
  summary,
  choice,
  onSave,
  onUnpick,
  onClose,
}: {
  summary: RecipeSummary;
  choice: RecipeChoice | undefined;
  onSave: (choice: RecipeChoice) => void;
  onUnpick?: () => void;
  onClose: () => void;
}) {
  const recipe = useRecipeOrToast(summary.id);
  const [optional, setOptional] = useState<number[]>(choice?.optional ?? []);
  const [modes, setModes] = useState<Record<string, SubRecipeMode>>(choice?.subRecipes ?? {});
  useEscapeKey(onClose);

  const lines = ingredientLines(recipe);
  const nested = lines.filter((r) => r.subRecipe);
  const extras = lines.filter((r) => r.optional && !r.subRecipe);
  const save = () => onSave({ optional: optional.filter((id) => extras.some((r) => r.id === id)), subRecipes: modes });

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={summary.name}>
        <h2>{summary.name}</h2>
        {!recipe && <p className="muted">Loading…</p>}
        <SubRecipeChoices lines={nested} modes={modes} onChange={(id, mode) => setModes((ms) => ({ ...ms, [id]: mode }))} />
        <OptionalChoices lines={extras} chosen={optional} onChange={setOptional} />
        <div className="row nowrap">
          {onUnpick ? (
            <button className="btn ghost" onClick={onUnpick}>
              Unpick
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="btn grow" disabled={!recipe} onClick={save}>
            {onUnpick ? "Save" : "Add to this week"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useRecipeOrToast(id: number): Recipe | null {
  const { recipe, error } = useRecipe(id);
  useEffect(() => {
    if (error) toast(error);
  }, [error]);
  return recipe;
}

function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEscape();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape]);
}

function ingredientLines(recipe: Recipe | null): IngredientLine[] {
  return recipe?.ingredients.flatMap((r) => (r.kind === "ingredient" ? [r] : [])) ?? [];
}

function ingredientText(r: IngredientLine): string {
  const amountAndName = [r.cookingAmount, r.groceryName].filter(Boolean).join(" ");
  return r.preparation ? `${amountAndName}, ${r.preparation}` : amountAndName;
}

const MODES: { mode: SubRecipeMode; label: string }[] = [
  { mode: "make", label: "Make it" },
  { mode: "buy", label: "Buy it" },
  { mode: "have", label: "Have it" },
];

function SubRecipeChoices({
  lines,
  modes,
  onChange,
}: {
  lines: IngredientLine[];
  modes: Record<string, SubRecipeMode>;
  onChange: (ingredientId: number, mode: SubRecipeMode) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <section className="stack tight">
      <span className="label">Made from other recipes</span>
      {lines.map((r) => (
        <SubRecipeChoice key={r.id} line={r} mode={modes[r.id] ?? defaultMode(r)} onChange={(mode) => onChange(r.id, mode)} />
      ))}
    </section>
  );
}

function SubRecipeChoice({ line, mode, onChange }: { line: IngredientLine; mode: SubRecipeMode; onChange: (mode: SubRecipeMode) => void }) {
  const { groceryById } = useData();
  const name = line.subRecipe!.name;
  return (
    <div className="stack tight nested">
      <div>
        <strong>{name}</strong>
        {line.cookingAmount && <span className="muted">, {line.cookingAmount}</span>}
        {line.optional && <span className="badge">optional</span>}
      </div>
      <div className="segmented" role="group" aria-label={`${name}: make, buy or have`}>
        {MODES.map((m) => (
          <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => onChange(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      <span className="small muted">{modeEffect(line, mode, groceryById.get(line.groceryId)?.product ?? null)}</span>
    </div>
  );
}

function modeEffect(line: IngredientLine, mode: SubRecipeMode, product: Product | null): string {
  if (mode === "make") return `Adds the ${line.subRecipe!.name} ingredients to the stock check.`;
  if (mode === "buy") return `Adds ${line.groceryName}${product ? ` (${productLabel(product)})` : ""} to the stock check.`;
  return "Already made, so nothing is added.";
}

function OptionalChoices({ lines, chosen, onChange }: { lines: IngredientLine[]; chosen: number[]; onChange: (chosen: number[]) => void }) {
  if (lines.length === 0) return null;
  const toggle = (id: number, on: boolean) => onChange(on ? [...chosen, id] : chosen.filter((x) => x !== id));
  return (
    <section className="stack tight">
      <span className="label">Optional. Try any this week?</span>
      {lines.map((r) => (
        <label key={r.id} className="check">
          <input type="checkbox" checked={chosen.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
          <span>{ingredientText(r)}</span>
        </label>
      ))}
    </section>
  );
}

function StockCheck({ state, dispatch, plan }: StepProps & { plan: OrderPlan }) {
  const view = plan.stockCheck;
  if (view.kind === "empty") {
    return <p className="empty">No recipes picked and no Essentials, so there's nothing to check. Go on to anything else.</p>;
  }
  if (view.kind === "summary") return <StockSummary state={state} dispatch={dispatch} check={plan.check} buying={view.buying} />;
  const item = plan.check[view.index]!;
  return (
    <StockCard
      key={item.groceryId}
      item={item}
      position={view.index}
      count={plan.check.length}
      answer={state.stock[item.groceryId]}
      onBack={view.index > 0 ? () => dispatch({ type: "showCard", index: view.index - 1 }) : undefined}
      onSummary={view.allAnswered ? () => dispatch({ type: "showSummary" }) : undefined}
      onAnswer={(quantity) => dispatch({ type: "answerCard", index: view.index, quantity })}
    />
  );
}

function StockSummary({ state, dispatch, check, buying }: StepProps & { check: CheckItem[]; buying: number }) {
  const { groceryById } = useData();
  return (
    <>
      <p className="muted">
        {buying} of {check.length} to buy. Tap an item to change it.
      </p>
      {groupByLocation(check).map((group) => (
        <section key={group.label} className="stack tight" aria-label={group.label}>
          <h2>{group.label}</h2>
          <div className="list">
            {group.items.map(({ item, index }) => {
              const answer = state.stock[item.groceryId];
              const grocery = groceryById.get(item.groceryId);
              return (
                <button key={item.groceryId} className={`li${answer === 0 ? " have" : ""}`} onClick={() => dispatch({ type: "showCard", index })}>
                  <span className="grow">
                    <span className="name">{item.groceryName}</span>
                    <br />
                    <span className="small muted">{describeAnswer(answer, grocery?.product ?? null)}</span>
                  </span>
                  <StoreBadge product={grocery?.product ?? null} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function groupByLocation(check: CheckItem[]) {
  const groups: { label: string; items: { item: CheckItem; index: number }[] }[] = [];
  check.forEach((item, index) => {
    const label = locationLabel(item.location);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push({ item, index });
  });
  return groups;
}

function StockCard({
  item,
  position,
  count,
  answer,
  onAnswer,
  onBack,
  onSummary,
}: {
  item: CheckItem;
  position: number;
  count: number;
  answer: number | undefined;
  onAnswer: (quantity: number) => void;
  onBack?: () => void;
  onSummary?: () => void;
}) {
  const { groceryById } = useData();
  const product = groceryById.get(item.groceryId)?.product ?? null;
  return (
    <>
      <div className="card" aria-live="polite">
        <span className="label">
          <span className="where">{locationLabel(item.location)}</span> · Item {position + 1} of {count}
        </span>
        <div className="item-name">{item.groceryName}</div>
        <p className="muted">{product ? productLabel(product) : "No product linked. You'll add this in the store app by hand."}</p>
        <EssentialNote item={item} />
        <IngredientUses item={item} />
        <QuantityPicker key={item.groceryId} start={startingQuantity(item, answer)} product={product} onAnswer={onAnswer} />
      </div>
      <div className="row between">
        <button className="btn plain" disabled={!onBack} onClick={onBack}>
          ← Previous item
        </button>
        {onSummary && (
          <button className="btn plain" onClick={onSummary}>
            See all items
          </button>
        )}
      </div>
      {answer !== undefined && <p className="small muted">Answered before: {describeAnswer(answer, product)}</p>}
    </>
  );
}

function startingQuantity(item: CheckItem, answer: number | undefined): number {
  return answer !== undefined && answer > 0 ? answer : item.start;
}

function EssentialNote({ item }: { item: CheckItem }) {
  if (!item.essential) return null;
  return (
    <p className="essential">
      <span className="badge">Essential</span>
      {item.essential.details && <span className="small"> {item.essential.details}</span>}
    </p>
  );
}

function IngredientUses({ item }: { item: CheckItem }) {
  if (item.uses.length === 0) return <p className="small muted">Is it running low? Leave it at 0 if there's enough.</p>;
  return (
    <ul className="uses">
      {item.uses.map((use) => (
        <li key={use.ingredientId}>
          <strong>{use.cookingAmount || "Some"}</strong>
          {use.preparation && ` ${use.preparation}`}, for {use.recipeName}
        </li>
      ))}
    </ul>
  );
}

function QuantityPicker({ start, product, onAnswer }: { start: number; product: Product | null; onAnswer: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(start);
  return (
    <div className="stack" style={{ alignItems: "center", marginTop: 8 }}>
      <div className="row" style={{ justifyContent: "center" }}>
        <span>Buy</span>
        <Stepper
          className="large"
          value={quantity}
          min={0}
          step={quantityStep(product)}
          onChange={(n) => (n <= 0 ? onAnswer(0) : setQuantity(n))}
          label="Quantity to buy"
        />
        {soldByPound(product) && <span>lb</span>}
      </div>
      <div className="row nowrap" style={{ width: "100%" }}>
        <button className="btn ghost" onClick={() => onAnswer(0)}>
          Have it
        </button>
        <button className="btn grow" onClick={() => onAnswer(quantity)}>
          Next
        </button>
      </div>
    </div>
  );
}

function soldByPound(product: Product | null): boolean {
  return product?.soldBy === "pound";
}

function quantityStep(product: Product | null): number {
  return soldByPound(product) ? 0.25 : 1;
}

function formatQuantity(quantity: number, product: Product | null): string {
  return `${formatNumber(quantity)}${soldByPound(product) ? " lb" : ""}`;
}

function describeAnswer(quantity: number | undefined, product: Product | null): string {
  if (quantity === undefined) return "Not checked yet";
  if (quantity <= 0) return "Have it";
  return `Buy ${formatQuantity(quantity, product)}`;
}

function AnythingElse({ state, dispatch }: StepProps) {
  return (
    <>
      <p className="muted">Search for anything else this week.</p>
      <CatalogSearch onAdd={(groceryId) => dispatch({ type: "addExtra", groceryId })} />
      <AddedExtras extras={state.extras} onChange={(groceryId, quantity) => dispatch({ type: "setExtra", groceryId, quantity })} />
    </>
  );
}

function CatalogSearch({ onAdd }: { onAdd: (groceryId: number) => void }) {
  const { groceries, setGrocery } = useData();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? groceries.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = groceries.some((g) => g.name.toLowerCase() === q);

  const add = (groceryId: number) => {
    onAdd(groceryId);
    setQuery("");
  };

  const create = async () => {
    try {
      const g = await api.post<Grocery>("/api/groceries", { name: query.trim() });
      setGrocery(g);
      add(g.id);
      toast(`Added ${g.name} to the catalog.`);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const submit = () => {
    if (matches[0] && (exact || matches.length === 1)) add(matches[0].id);
    else if (q && !exact) void create();
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input type="search" placeholder="Search the catalog" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the catalog" />
      </form>
      {q && (
        <div className="list">
          {matches.map((g) => (
            <button key={g.id} className="li" onClick={() => add(g.id)}>
              <span className="grow name">{g.name}</span>
              <StoreBadge product={g.product} />
            </button>
          ))}
          {!exact && (
            <button className="li" onClick={() => void create()}>
              <span className="grow">
                Add <strong>"{query.trim()}"</strong> as a new grocery
              </span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

function AddedExtras({ extras, onChange }: { extras: Record<string, number>; onChange: (groceryId: number, quantity: number) => void }) {
  const { groceryById } = useData();
  const added = Object.entries(extras).flatMap(([id, quantity]) => {
    const grocery = groceryById.get(Number(id));
    return grocery ? [{ grocery, quantity }] : [];
  });
  if (added.length === 0) return null;
  return (
    <>
      <h2>Added</h2>
      <div className="list">
        {added.map(({ grocery, quantity }) => (
          <div key={grocery.id} className="li">
            <span className="grow">
              <span className="name">{grocery.name}</span>
              <br />
              <StoreBadge product={grocery.product} />
            </span>
            <Stepper
              value={quantity}
              min={0}
              step={quantityStep(grocery.product)}
              onChange={(n) => onChange(grocery.id, n)}
              label={`How many ${grocery.name}`}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function FillCarts({ state, dispatch, plan }: StepProps & { plan: OrderPlan }) {
  const { carts, unlinked, invalid } = plan.carts;
  const remove = (groceryId: number) => dispatch({ type: "removeLine", groceryId });
  const nothing = carts.length === 0 && unlinked.length === 0 && invalid.length === 0;
  return (
    <>
      {nothing && <p className="empty">Nothing to buy yet. Go back and add some items.</p>}
      <div className="stack cart-grid">
        {carts.map((cart) => (
          <StoreCartBox key={cart.store} cart={cart} sent={state.sent.includes(cart.store)} onRemove={remove} onOpen={() => dispatch({ type: "cartSent", store: cart.store })} />
        ))}
        <HandAddList lines={unlinked} />
        <FixLinksList lines={invalid} />
        <RemovedList removed={state.removed} onPutBack={(groceryId) => dispatch({ type: "putBack", groceryId })} />
      </div>
      <p className="small muted">
        If a store shows an error instead of the cart, one product is probably unavailable. Remove it here and tap the button again.
      </p>
      <StartOverButton onStartOver={() => {
        dispatch({ type: "startOver" });
        window.scrollTo(0, 0);
      }} />
    </>
  );
}

function StoreCartBox({ cart, sent, onRemove, onOpen }: { cart: StoreCart; sent: boolean; onRemove: (groceryId: number) => void; onOpen: () => void }) {
  const store = STORE_NAMES[cart.store];
  return (
    <section className="storebox">
      <div className="row between">
        <h2>{store}</h2>
        <span className="muted small">
          {cart.lines.length} item{cart.lines.length === 1 ? "" : "s"}
        </span>
      </div>
      <LineList lines={cart.lines} onRemove={onRemove} />
      <a className={`btn big ${cart.store}`} href={cart.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
        Fill my {store} cart
      </a>
      {sent && (
        <p className="small muted">
          Sent to {store}. Tapping again adds everything a second time.
          {cart.store === "amazon" && " On Amazon, confirm the items on the page that opens."}
        </p>
      )}
    </section>
  );
}

function LineList({ lines, onRemove }: { lines: OrderLine[]; onRemove: (groceryId: number) => void }) {
  return (
    <div className="list">
      {lines.map((l) => (
        <div key={l.groceryId} className="li">
          <span className="grow">
            <span className="name">{l.groceryName}</span>
            {l.product && (
              <>
                <br />
                <span className="small muted">{productLabel(l.product)}</span>
              </>
            )}
          </span>
          <strong>{formatQuantity(l.quantity, l.product)}</strong>
          <button className="btn plain small" aria-label={`Remove ${l.groceryName}`} onClick={() => onRemove(l.groceryId)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function HandAddList({ lines }: { lines: OrderLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="storebox">
      <h2>Add these by hand</h2>
      <p className="small muted">These groceries have no linked product, so no cart link can include them.</p>
      <div className="list">
        {lines.map((l) => (
          <Link key={l.groceryId} className="li" href={`/catalog/${l.groceryId}`}>
            <span className="grow name">{l.groceryName}</span>
            <strong>{formatNumber(l.quantity)}</strong>
            <span className="small">Link</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FixLinksList({ lines }: { lines: OrderLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="storebox">
      <h2 className="warn-text">Product links to fix</h2>
      <p className="small muted">The store would reject these product numbers, so they're left out of the cart links.</p>
      <div className="list">
        {lines.map((l) => (
          <Link key={l.groceryId} className="li" href={`/catalog/${l.groceryId}`}>
            <span className="grow name">{l.groceryName}</span>
            <span className="small">Fix</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RemovedList({ removed, onPutBack }: { removed: number[]; onPutBack: (groceryId: number) => void }) {
  const { groceryById } = useData();
  if (removed.length === 0) return null;
  return (
    <section className="storebox">
      <h2>Removed</h2>
      <div className="list">
        {removed.map((id) => (
          <div key={id} className="li">
            <span className="grow name">{groceryById.get(id)?.name ?? "Removed grocery"}</span>
            <button className="btn plain small" onClick={() => onPutBack(id)}>
              Put back
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function StartOverButton({ onStartOver }: { onStartOver: () => void }) {
  return (
    <button
      className="btn danger"
      onClick={() => {
        if (confirm("Start a new weekly order? This clears this phone's choices.")) onStartOver();
      }}
    >
      Start a new order
    </button>
  );
}
