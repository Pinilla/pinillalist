import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { formatNumber } from "../../shared/amounts.ts";
import { buildCartPlan, type OrderLine } from "../../shared/carts.ts";
import { filterRecipes } from "../../shared/filters.ts";
import { locationLabel } from "../../shared/locations.ts";
import { defaultMode, mergeIngredients, subRecipeIds, type SubRecipeMode } from "../../shared/merge.ts";
import {
  STEPS,
  answerStock,
  firstUnanswered,
  loadOrder,
  newOrder,
  orderLines,
  pickRecipe,
  toggleRecipe,
  unpickRecipe,
  type OrderState,
  type RecipeChoice,
} from "../../shared/order.ts";
import { buildStockCheck, type CheckItem } from "../../shared/stock.ts";
import { STORE_NAMES, type Grocery, type Recipe, type RecipeSummary } from "../../shared/types.ts";
import { api } from "../api.ts";
import { CollectionChips, Stepper, StoreBadge, Thumb, productLabel, toast, useDesktop } from "../components.tsx";
import { useData } from "../data.tsx";

const STORAGE_KEY = "pinillalist.order";

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
    // Private browsing: the order still works, it just won't survive closing the app.
  }
}

/** Deli products sold by the pound go up a quarter pound at a time. */
function qtyStep(grocery: Grocery | undefined): number {
  return grocery?.product?.soldBy === "pound" ? 0.25 : 1;
}

export function OrderPage() {
  const { groceryById, lists, loaded } = useData();
  const [state, setStateRaw] = useState<OrderState>(() => loadOrder(readSaved()));
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [subRecipes, setSubRecipes] = useState<Map<number, Recipe>>(new Map());
  const [recipesFor, setRecipesFor] = useState("");

  const setState = (update: (s: OrderState) => OrderState) =>
    setStateRaw((s) => {
      const next = update(s);
      save(next);
      return next;
    });

  // Fetch the chosen recipes in full, in the order they were picked, and the recipes their ingredients are made from.
  const idsKey = state.recipeIds.join(",");
  useEffect(() => {
    if (!idsKey) {
      setRecipes([]);
      setSubRecipes(new Map());
      setRecipesFor("");
      return;
    }
    let live = true;
    (async () => {
      const picked = await api.get<Recipe[]>(`/api/recipes?ids=${idsKey}`);
      const subIds = subRecipeIds(picked);
      const subs = subIds.length ? await api.get<Recipe[]>(`/api/recipes?ids=${subIds.join(",")}`) : [];
      if (!live) return;
      setRecipes(picked);
      setSubRecipes(new Map(subs.map((r) => [r.id, r])));
      setRecipesFor(idsKey);
    })().catch((err: Error) => toast(err.message));
    return () => {
      live = false;
    };
  }, [idsKey]);

  const essentials = useMemo(() => lists.find((l) => l.kind === "essentials")?.items ?? [], [lists]);
  const check = useMemo(
    () => buildStockCheck(mergeIngredients(recipes, groceryById, state.choices, subRecipes), essentials, groceryById),
    [recipes, subRecipes, state.choices, essentials, groceryById],
  );
  // Until the picked recipes arrive, the walk would be Essentials only and then reshuffle.
  const recipesLoading = idsKey !== "" && recipesFor !== idsKey;
  const lines = useMemo(() => orderLines(state, check, groceryById), [state, check, groceryById]);

  const go = (step: number) => {
    setState((s) => {
      const next = { ...s, step: Math.max(0, Math.min(STEPS.length - 1, step)) };
      // Opening the stock check with new cards (a recipe or extra picked since) starts at the first one.
      const unanswered = firstUnanswered(s, check);
      return next.step === 1 && unanswered < check.length ? { ...next, stockIndex: unanswered, stockReviewed: false } : next;
    });
    window.scrollTo(0, 0);
  };


  // When the cards change while the stock check is open (the picked recipes finished loading), go to the first new one.
  const checkKey = check.map((c) => c.groceryId).join(",");
  useEffect(() => {
    setStateRaw((s) => {
      if (s.step !== 1) return s;
      const unanswered = firstUnanswered(s, check);
      if (unanswered === check.length || s.stock[check[Math.min(s.stockIndex, check.length - 1)]?.groceryId ?? -1] === undefined) return s;
      const next = { ...s, stockIndex: unanswered, stockReviewed: false };
      save(next);
      return next;
    });
    // Only when the set of cards changes, so moving back to an answered card stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  if (!loaded) return <main className="wrap empty">Loading…</main>;

  return (
    <main className={`wrap stack order${state.step >= 1 && state.step <= 2 ? " narrow-step" : ""}`}>
      <div>
        <div className="row between">
          <span className="label">
            Step {state.step + 1} of {STEPS.length}
          </span>
          <span className="label">Weekly order</span>
        </div>
        <div className="steps" role="tablist" aria-label="Steps">
          {STEPS.map((name, i) => (
            <button
              key={name}
              role="tab"
              aria-selected={i === state.step}
              aria-label={name}
              className={i <= state.step ? "done" : ""}
              onClick={() => go(i)}
            >
              <span className="step-name">
                {i + 1}. {name}
              </span>
            </button>
          ))}
        </div>
        <h1>{STEPS[state.step]}</h1>
      </div>

      <div className="stack step-body">
        {state.step === 0 && <PickRecipes state={state} setState={setState} />}
        {state.step === 1 && (
          <StockCheck state={state} setState={setState} check={check} loading={recipesLoading} groceryById={groceryById} />
        )}
        {state.step === 2 && <AnythingElse state={state} setState={setState} />}
        {state.step === 3 && (
          <FillCarts
            state={state}
            setState={setState}
            lines={lines}
            onReset={() => {
              setState(() => newOrder());
              window.scrollTo(0, 0);
            }}
          />
        )}
      </div>

      <div className="sticky-foot">
        <div className="row nowrap">
          <button className="btn ghost" disabled={state.step === 0} onClick={() => go(state.step - 1)}>
            Back
          </button>
          {state.step < STEPS.length - 1 && (
            <button className="btn grow" onClick={() => go(state.step + 1)}>
              Next: {STEPS[state.step + 1]}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

type StepProps = { state: OrderState; setState: (u: (s: OrderState) => OrderState) => void };

function PickRecipes({ state, setState }: StepProps) {
  const { recipes, collections } = useData();
  const desktop = useDesktop();
  const [query, setQuery] = useState("");
  const [sheetFor, setSheetFor] = useState<RecipeSummary | null>(null);
  const tap = (r: RecipeSummary) => (r.hasExtras ? setSheetFor(r) : setState((s) => toggleRecipe(s, r.id)));
  const nameById = new Map(recipes.map((r) => [r.id, r.name]));
  const shown = filterRecipes(recipes, state.collectionFilters, query);

  return (
    <div className="stack pick">
      <div className="stack">
        <p className="muted">
          {state.recipeIds.length === 0
            ? "Tap the recipes you'll cook this week."
            : `${state.recipeIds.length} chosen. Tap again to unpick.`}
        </p>
        <input type="search" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
        <CollectionChips
          collections={collections}
          chosen={state.collectionFilters}
          onChange={(chosen) => setState((s) => ({ ...s, collectionFilters: chosen }))}
        />
        {shown.length === 0 ? (
          <p className="empty">No recipes here.</p>
        ) : (
          <div className="grid">
            {shown.map((r) => {
              const on = state.recipeIds.includes(r.id);
              return (
                <button key={r.id} className={`tile${on ? " on" : ""}`} aria-pressed={on} onClick={() => tap(r)}>
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
        )}
      </div>
      {desktop && (
        <aside className="storebox chosen" aria-label="Picked recipes">
          <h2>This week</h2>
          {state.recipeIds.length === 0 ? (
            <p className="muted small">Nothing picked yet.</p>
          ) : (
            <div className="list">
              {state.recipeIds.map((id) => (
                <div key={id} className="li">
                  <span className="grow name">{nameById.get(id) ?? "Deleted recipe"}</span>
                  <button className="btn plain small" aria-label={`Unpick ${nameById.get(id) ?? "recipe"}`} onClick={() => setState((s) => unpickRecipe(s, id))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
      {sheetFor && (
        <ExtrasSheet
          summary={sheetFor}
          picked={state.recipeIds.includes(sheetFor.id)}
          choice={state.choices[sheetFor.id]}
          onSave={(choice) => {
            setState((s) => pickRecipe(s, sheetFor.id, choice));
            setSheetFor(null);
          }}
          onRemove={() => {
            setState((s) => unpickRecipe(s, sheetFor.id));
            setSheetFor(null);
          }}
          onClose={() => setSheetFor(null)}
        />
      )}
    </div>
  );
}

const MODES: { mode: SubRecipeMode; label: string }[] = [
  { mode: "make", label: "Make it" },
  { mode: "buy", label: "Buy it" },
  { mode: "have", label: "Have it" },
];

/**
 * Asks about a recipe's extras as it's picked: whether to make, buy or skip
 * each ingredient made from another recipe (make is the default), and which
 * optional ingredients to try this week (none by default).
 */
function ExtrasSheet({
  summary,
  picked,
  choice,
  onSave,
  onRemove,
  onClose,
}: {
  summary: RecipeSummary;
  picked: boolean;
  choice: RecipeChoice | undefined;
  onSave: (choice: RecipeChoice) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { groceryById } = useData();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [optional, setOptional] = useState<number[]>(choice?.optional ?? []);
  const [modes, setModes] = useState<Record<string, SubRecipeMode>>(choice?.subRecipes ?? {});

  useEffect(() => {
    let live = true;
    api
      .get<Recipe>(`/api/recipes/${summary.id}`)
      .then((r) => live && setRecipe(r))
      .catch((err: Error) => toast(err.message));
    return () => {
      live = false;
    };
  }, [summary.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = recipe?.ingredients.flatMap((r) => (r.kind === "ingredient" ? [r] : [])) ?? [];
  const nested = rows.filter((r) => r.subRecipe);
  const extras = rows.filter((r) => r.optional && !r.subRecipe);
  const line = (r: (typeof rows)[number]) => [r.cookingAmount, r.groceryName].filter(Boolean).join(" ") + (r.preparation ? `, ${r.preparation}` : "");

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={summary.name}>
        <h2>{summary.name}</h2>
        {!recipe && <p className="muted">Loading…</p>}
        {nested.length > 0 && (
          <section className="stack tight">
            <span className="label">Made from other recipes</span>
            {nested.map((r) => {
              const mode = modes[r.id] ?? defaultMode(r);
              const product = groceryById.get(r.groceryId)?.product;
              return (
                <div key={r.id} className="stack tight nested">
                  <div>
                    <strong>{r.subRecipe!.name}</strong>
                    {r.cookingAmount && <span className="muted">, {r.cookingAmount}</span>}
                    {r.optional && <span className="badge">optional</span>}
                  </div>
                  <div className="segmented" role="group" aria-label={`${r.subRecipe!.name}: make, buy or have`}>
                    {MODES.map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        aria-pressed={mode === m.mode}
                        onClick={() => setModes((ms) => ({ ...ms, [r.id]: m.mode }))}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <span className="small muted">
                    {mode === "make" && `Adds the ${r.subRecipe!.name} ingredients to the stock check.`}
                    {mode === "buy" && `Adds ${r.groceryName}${product ? ` (${productLabel(product)})` : ""} to the stock check.`}
                    {mode === "have" && "Already made, so nothing is added."}
                  </span>
                </div>
              );
            })}
          </section>
        )}
        {extras.length > 0 && (
          <section className="stack tight">
            <span className="label">Optional. Try any this week?</span>
            {extras.map((r) => (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={optional.includes(r.id)}
                  onChange={(e) => setOptional((o) => (e.target.checked ? [...o, r.id] : o.filter((id) => id !== r.id)))}
                />
                <span>{line(r)}</span>
              </label>
            ))}
          </section>
        )}
        <div className="row nowrap">
          {picked ? (
            <button className="btn ghost" onClick={onRemove}>
              Unpick
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <button
            className="btn grow"
            disabled={!recipe}
            onClick={() => onSave({ optional: optional.filter((id) => extras.some((r) => r.id === id)), subRecipes: modes })}
          >
            {picked ? "Save" : "Add to this week"}
          </button>
        </div>
      </div>
    </div>
  );
}


function describeAnswer(quantity: number | undefined, grocery: Grocery | undefined): string {
  if (quantity === undefined) return "Not checked yet";
  if (quantity <= 0) return "Have it";
  return `Buy ${formatNumber(quantity)}${grocery?.product?.soldBy === "pound" ? " lb" : ""}`;
}

function StockCheck({
  state,
  setState,
  check,
  loading,
  groceryById,
}: StepProps & { check: CheckItem[]; loading: boolean; groceryById: Map<number, Grocery> }) {
  if (loading) return <p className="empty">Loading the recipes…</p>;
  if (check.length === 0) {
    return <p className="empty">No recipes picked and no Essentials, so there's nothing to check. Go on to anything else.</p>;
  }

  const index = Math.min(state.stockIndex, check.length - 1);
  const allAnswered = firstUnanswered(state, check) === check.length;

  if (state.stockReviewed && allAnswered) {
    const buying = check.filter((m) => (state.stock[m.groceryId] ?? 0) > 0).length;
    const groups: { label: string; items: { item: CheckItem; i: number }[] }[] = [];
    check.forEach((item, i) => {
      const label = locationLabel(item.location);
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1)!.items.push({ item, i });
    });
    return (
      <>
        <p className="muted">
          {buying} of {check.length} to buy. Tap an item to change it.
        </p>
        {groups.map((group) => (
          <section key={group.label} className="stack tight" aria-label={group.label}>
            <h2>{group.label}</h2>
            <div className="list">
              {group.items.map(({ item, i }) => {
                const answer = state.stock[item.groceryId];
                return (
                  <button
                    key={item.groceryId}
                    className={`li${answer === 0 ? " have" : ""}`}
                    onClick={() => setState((s) => ({ ...s, stockIndex: i, stockReviewed: false }))}
                  >
                    <span className="grow">
                      <span className="name">{item.groceryName}</span>
                      <br />
                      <span className="small muted">{describeAnswer(answer, groceryById.get(item.groceryId))}</span>
                    </span>
                    <StoreBadge product={groceryById.get(item.groceryId)?.product ?? null} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </>
    );
  }

  const item = check[index]!;
  return (
    <StockCard
      key={item.groceryId}
      item={item}
      position={index}
      count={check.length}
      grocery={groceryById.get(item.groceryId)}
      answer={state.stock[item.groceryId]}
      onBack={index > 0 ? () => setState((s) => ({ ...s, stockIndex: index - 1 })) : undefined}
      onSummary={allAnswered ? () => setState((s) => ({ ...s, stockReviewed: true })) : undefined}
      onAnswer={(quantity) =>
        setState((s) => {
          const next = answerStock(s, item.groceryId, quantity);
          const after = check.findIndex((m, i) => i > index && next.stock[m.groceryId] === undefined);
          const unanswered = after !== -1 ? after : firstUnanswered(next, check);
          return unanswered === check.length
            ? { ...next, stockReviewed: true }
            : { ...next, stockIndex: unanswered, stockReviewed: false };
        })
      }
    />
  );
}

/**
 * One grocery in the stock check: where to look, the ingredient lines that ask
 * for it, and how many of its product to buy. A recipe grocery starts at 1 and
 * an Essential at 0. Taking the quantity down to 0 means there's enough at home
 * and moves to the next grocery.
 */
function StockCard({
  item,
  position,
  count,
  grocery,
  answer,
  onAnswer,
  onBack,
  onSummary,
}: {
  item: CheckItem;
  position: number;
  count: number;
  grocery: Grocery | undefined;
  answer: number | undefined;
  onAnswer: (quantity: number) => void;
  onBack?: () => void;
  onSummary?: () => void;
}) {
  const [quantity, setQuantity] = useState(answer !== undefined && answer > 0 ? answer : item.start);
  const product = grocery?.product ?? null;
  const byPound = product?.soldBy === "pound";

  return (
    <>
      <div className="card" aria-live="polite">
        <span className="label">
          <span className="where">{locationLabel(item.location)}</span> · Item {position + 1} of {count}
        </span>
        <div className="item-name">{item.groceryName}</div>
        <p className="muted">{product ? productLabel(product) : "No product linked. You'll add this in the store app by hand."}</p>
        {item.essential && (
          <p className="essential">
            <span className="badge">Essential</span>
            {item.essential.details && <span className="small"> {item.essential.details}</span>}
          </p>
        )}
        {item.uses.length > 0 && (
          <ul className="uses">
            {item.uses.map((use) => (
              <li key={use.ingredientId}>
                <strong>{use.cookingAmount || "Some"}</strong>
                {use.preparation && ` ${use.preparation}`}, for {use.recipeName}
              </li>
            ))}
          </ul>
        )}
        {item.uses.length === 0 && <p className="small muted">Is it running low? Leave it at 0 if there's enough.</p>}
        <div className="stack" style={{ alignItems: "center", marginTop: 8 }}>
          <div className="row" style={{ justifyContent: "center" }}>
            <span>Buy</span>
            <Stepper
              large
              value={quantity}
              min={0}
              step={byPound ? 0.25 : 1}
              onChange={(n) => (n <= 0 ? onAnswer(0) : setQuantity(n))}
              label="Quantity to buy"
            />
            {byPound && <span>lb</span>}
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
      {answer !== undefined && <p className="small muted">Answered before: {describeAnswer(answer, grocery)}</p>}
    </>
  );
}

function AnythingElse({ state, setState }: StepProps) {
  const { groceries, groceryById, setGrocery } = useData();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? groceries.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = groceries.some((g) => g.name.toLowerCase() === q);
  const added = Object.entries(state.extras);

  const add = (id: number) => {
    setState((s) => ({ ...s, extras: { ...s.extras, [id]: (s.extras[id] ?? 0) + 1 } }));
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

  return (
    <>
      <p className="muted">Search for anything else this week.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0] && (exact || matches.length === 1)) add(matches[0].id);
          else if (q && !exact) void create();
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
      {added.length > 0 && (
        <>
          <h2>Added</h2>
          <div className="list">
            {added.map(([id, qty]) => {
              const g = groceryById.get(Number(id));
              if (!g) return null;
              return (
                <div key={id} className="li">
                  <span className="grow">
                    <span className="name">{g.name}</span>
                    <br />
                    <StoreBadge product={g.product} />
                  </span>
                  <Stepper
                    value={qty}
                    min={0}
                    step={qtyStep(g)}
                    onChange={(n) =>
                      setState((s) => {
                        const extras = { ...s.extras };
                        if (n <= 0) delete extras[id];
                        else extras[id] = n;
                        return { ...s, extras };
                      })
                    }
                    label={`How many ${g.name}`}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
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
          <strong>
            {formatNumber(l.quantity)}
            {l.product?.soldBy === "pound" ? " lb" : ""}
          </strong>
          <button className="btn plain small" aria-label={`Remove ${l.groceryName}`} onClick={() => onRemove(l.groceryId)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function FillCarts({ state, setState, lines, onReset }: StepProps & { lines: OrderLine[]; onReset: () => void }) {
  const { groceryById } = useData();
  const plan = buildCartPlan(lines);
  const remove = (groceryId: number) => setState((s) => ({ ...s, removed: [...new Set([...s.removed, groceryId])] }));
  const nothing = plan.carts.length === 0 && plan.unlinked.length === 0 && plan.invalid.length === 0;
  return (
    <>
      {nothing && <p className="empty">Nothing to buy yet. Go back and add some items.</p>}
      <div className="stack cart-grid">
        {plan.carts.map((cart) => {
          const sent = state.sent.includes(cart.store);
          return (
            <section key={cart.store} className="storebox">
              <div className="row between">
                <h2>{STORE_NAMES[cart.store]}</h2>
                <span className="muted small">
                  {cart.lines.length} item{cart.lines.length === 1 ? "" : "s"}
                </span>
              </div>
              <LineList lines={cart.lines} onRemove={remove} />
              <a
                className={`btn big ${cart.store}`}
                href={cart.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setState((s) => ({ ...s, sent: [...new Set([...s.sent, cart.store])] }))}
              >
                Fill my {STORE_NAMES[cart.store]} cart
              </a>
              {sent && (
                <p className="small muted">
                  Sent to {STORE_NAMES[cart.store]}. Tapping again adds everything a second time.
                  {cart.store === "amazon" && " On Amazon, confirm the items on the page that opens."}
                </p>
              )}
            </section>
          );
        })}
        {plan.unlinked.length > 0 && (
          <section className="storebox">
            <h2>Add these by hand</h2>
            <p className="small muted">These groceries have no linked product, so no cart link can include them.</p>
            <div className="list">
              {plan.unlinked.map((l) => (
                <Link key={l.groceryId} className="li" href={`/catalog/${l.groceryId}`}>
                  <span className="grow name">{l.groceryName}</span>
                  <strong>{formatNumber(l.quantity)}</strong>
                  <span className="small">Link</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {plan.invalid.length > 0 && (
          <section className="storebox">
            <h2 className="warn-text">Product links to fix</h2>
            <p className="small muted">The store would reject these product numbers, so they're left out of the cart links.</p>
            <div className="list">
              {plan.invalid.map((l) => (
                <Link key={l.groceryId} className="li" href={`/catalog/${l.groceryId}`}>
                  <span className="grow name">{l.groceryName}</span>
                  <span className="small">Fix</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {state.removed.length > 0 && (
          <section className="storebox">
            <h2>Removed</h2>
            <div className="list">
              {state.removed.map((id) => (
                <div key={id} className="li">
                  <span className="grow name">{groceryById.get(id)?.name ?? "Removed grocery"}</span>
                  <button className="btn plain small" onClick={() => setState((s) => ({ ...s, removed: s.removed.filter((r) => r !== id) }))}>
                    Put back
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="small muted">
        If a store shows an error instead of the cart, one product is probably unavailable. Remove it here and tap the button again.
      </p>
      <button
        className="btn danger"
        onClick={() => {
          if (confirm("Start a new weekly order? This clears this phone's choices.")) onReset();
        }}
      >
        Start a new order
      </button>
    </>
  );
}
