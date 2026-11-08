import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { formatBuyingAmount, formatNumber } from "../../shared/amounts.ts";
import { buildCartPlan, type OrderLine } from "../../shared/carts.ts";
import { mergeIngredients, missingAmounts, type MergedItem } from "../../shared/merge.ts";
import {
  STEPS,
  answerStock,
  firstUnanswered,
  loadOrder,
  newOrder,
  orderLines,
  toggleRecipe,
  type OrderState,
  type StockChoice,
} from "../../shared/order.ts";
import { STORE_NAMES, type Grocery, type Recipe } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Stepper, StoreBadge, Thumb, productLabel, toast } from "../components.tsx";
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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function OrderPage() {
  const { groceryById, loaded } = useData();
  const [state, setStateRaw] = useState<OrderState>(() => loadOrder(readSaved()));
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const setState = (update: (s: OrderState) => OrderState) =>
    setStateRaw((s) => {
      const next = update(s);
      save(next);
      return next;
    });

  // Fetch the chosen recipes in full, in the order they were picked.
  const idsKey = state.recipeIds.join(",");
  useEffect(() => {
    if (!idsKey) {
      setRecipes([]);
      return;
    }
    let live = true;
    api
      .get<Recipe[]>(`/api/recipes?ids=${idsKey}`)
      .then((r) => live && setRecipes(r))
      .catch((err: Error) => toast(err.message));
    return () => {
      live = false;
    };
  }, [idsKey]);

  const merged = useMemo(() => mergeIngredients(recipes, groceryById), [recipes, groceryById]);
  const lines = useMemo(() => orderLines(state, merged, groceryById), [state, merged, groceryById]);

  const go = (step: number) => {
    setState((s) => ({ ...s, step: Math.max(0, Math.min(STEPS.length - 1, step)) }));
    window.scrollTo(0, 0);
  };

  const setBuyingAmount = async (ingredientId: number, buyingAmount: number) => {
    await api.patch(`/api/ingredients/${ingredientId}`, { buyingAmount });
    setRecipes((rs) =>
      rs.map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) => (i.kind === "ingredient" && i.id === ingredientId ? { ...i, buyingAmount } : i)),
      })),
    );
  };

  if (!loaded) return <main className="wrap empty">Loading…</main>;

  return (
    <main className="wrap stack">
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
            />
          ))}
        </div>
        <h1>{STEPS[state.step]}</h1>
      </div>

      {state.step === 0 && <PickRecipes state={state} setState={setState} />}
      {state.step === 1 && (
        <StockCheck state={state} setState={setState} merged={merged} groceryById={groceryById} onSetBuying={setBuyingAmount} />
      )}
      {state.step === 2 && <Essentials state={state} setState={setState} />}
      {state.step === 3 && <AnythingElse state={state} setState={setState} />}
      {state.step === 4 && (
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
  const [query, setQuery] = useState("");
  const filter = state.collectionFilter;
  const shown = recipes.filter(
    (r) =>
      (filter === null || r.collectionIds.includes(filter)) &&
      (!query || r.name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <>
      <p className="muted">
        {state.recipeIds.length === 0
          ? "Tap the recipes you'll cook this week."
          : `${state.recipeIds.length} chosen. Tap again to unpick.`}
      </p>
      <input type="search" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
      <div className="chips" role="group" aria-label="Collections">
        <button className={`chip${filter === null ? " on" : ""}`} onClick={() => setState((s) => ({ ...s, collectionFilter: null }))}>
          All
        </button>
        {collections.map((c) => (
          <button
            key={c.id}
            className={`chip${filter === c.id ? " on" : ""}`}
            onClick={() => setState((s) => ({ ...s, collectionFilter: c.id }))}
          >
            {c.name}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">No recipes here.</p>
      ) : (
        <div className="grid">
          {shown.map((r) => {
            const on = state.recipeIds.includes(r.id);
            return (
              <button key={r.id} className={`tile${on ? " on" : ""}`} aria-pressed={on} onClick={() => setState((s) => toggleRecipe(s, r.id))}>
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
    </>
  );
}

function describeChoice(item: MergedItem, answer: StockChoice | undefined, grocery: Grocery | undefined): string {
  if (!answer) return "Not checked yet";
  if (answer.choice === "have") return "Have it";
  const unit = grocery?.product?.soldBy === "pound" ? "lb" : "";
  const qty = `buy ${formatNumber(answer.quantity)}${unit ? " lb" : ""}`;
  if (answer.choice === "all") return `Need all, ${qty}`;
  return `Need ${formatBuyingAmount(answer.buyAmount, item.unit, item.groceryName)}, ${qty}`;
}

function StockCheck({
  state,
  setState,
  merged,
  groceryById,
  onSetBuying,
}: StepProps & {
  merged: MergedItem[];
  groceryById: Map<number, Grocery>;
  onSetBuying: (ingredientId: number, amount: number) => Promise<void>;
}) {
  if (state.recipeIds.length === 0) {
    return <p className="empty">No recipes picked, so there's nothing to check. Go on to the essentials.</p>;
  }
  if (merged.length === 0) return <p className="empty">Loading the recipes…</p>;

  const index = Math.min(state.stockIndex, merged.length - 1);
  const allAnswered = firstUnanswered(state, merged) === merged.length;

  if (state.stockReviewed && allAnswered) {
    const buying = merged.filter((m) => state.stock[m.groceryId]?.choice !== "have").length;
    return (
      <>
        <p className="muted">
          {buying} of {merged.length} to buy. Tap an item to change it.
        </p>
        <div className="list">
          {merged.map((item, i) => {
            const answer = state.stock[item.groceryId];
            return (
              <button
                key={item.groceryId}
                className={`li${answer?.choice === "have" ? " have" : ""}`}
                onClick={() => setState((s) => ({ ...s, stockIndex: i, stockReviewed: false }))}
              >
                <span className="grow">
                  <span className="name">{item.groceryName}</span>
                  <br />
                  <span className="small muted">{describeChoice(item, answer, groceryById.get(item.groceryId))}</span>
                </span>
                <StoreBadge product={groceryById.get(item.groceryId)?.product ?? null} />
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const item = merged[index]!;
  return (
    <StockCard
      key={item.groceryId}
      item={item}
      position={index}
      count={merged.length}
      grocery={groceryById.get(item.groceryId)}
      answer={state.stock[item.groceryId]}
      onSetBuying={onSetBuying}
      onBack={index > 0 ? () => setState((s) => ({ ...s, stockIndex: index - 1 })) : undefined}
      onSummary={allAnswered ? () => setState((s) => ({ ...s, stockReviewed: true })) : undefined}
      onAnswer={(answer) =>
        setState((s) => {
          const next = answerStock(s, item.groceryId, answer);
          const after = merged.findIndex((m, i) => i > index && !next.stock[m.groceryId]);
          const unanswered = after !== -1 ? after : firstUnanswered(next, merged);
          return unanswered === merged.length
            ? { ...next, stockReviewed: true }
            : { ...next, stockIndex: unanswered, stockReviewed: false };
        })
      }
    />
  );
}

function StockCard({
  item,
  position,
  count,
  grocery,
  answer,
  onAnswer,
  onBack,
  onSummary,
  onSetBuying,
}: {
  item: MergedItem;
  position: number;
  count: number;
  grocery: Grocery | undefined;
  answer: StockChoice | undefined;
  onAnswer: (a: StockChoice) => void;
  onBack?: () => void;
  onSummary?: () => void;
  onSetBuying: (ingredientId: number, amount: number) => Promise<void>;
}) {
  const [phase, setPhase] = useState<"choose" | "some" | "qty">("choose");
  const [pending, setPending] = useState<"all" | "some">("all");
  const [buyAmount, setBuyAmount] = useState(answer?.choice === "some" ? answer.buyAmount : 1);
  const [quantity, setQuantity] = useState(answer && answer.choice !== "have" ? answer.quantity : 1);
  const product = grocery?.product ?? null;
  const byPound = product?.soldBy === "pound";
  const missing = missingAmounts(item);
  const unitWord = item.unit || item.groceryName.toLowerCase();

  return (
    <>
      <div className="card" aria-live="polite">
        <span className="label">
          Item {position + 1} of {count}
        </span>
        <div className="item-name">{item.groceryName}</div>
        {item.total !== null && (
          <p>
            <strong>{formatBuyingAmount(item.total, item.unit, item.groceryName)}</strong>, for {joinNames(item.recipeNames)}
          </p>
        )}
        {item.total === null && <p>For {joinNames(item.recipeNames)}</p>}
        {missing.length > 0 && (
          <div className="stack tight" style={{ textAlign: "left" }}>
            {missing.map((use) => (
              <MissingAmount key={use.ingredientId} use={use} unitWord={unitWord} onSave={onSetBuying} />
            ))}
          </div>
        )}

        {phase === "choose" && (
          <div className="stack" style={{ marginTop: 8 }}>
            <button className="btn big ghost" onClick={() => onAnswer({ choice: "have" })}>
              Have it
            </button>
            <div className="two">
              <button
                className="btn"
                onClick={() => {
                  setPending("all");
                  setPhase("qty");
                }}
              >
                Need all of it
              </button>
              <button className="btn" onClick={() => setPhase("some")}>
                Need some of it
              </button>
            </div>
          </div>
        )}

        {phase === "some" && (
          <div className="stack" style={{ alignItems: "center", marginTop: 8 }}>
            <p>How much do you need to buy?</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Stepper large value={buyAmount} onChange={setBuyAmount} min={0} step={item.unit === "lb" ? 0.5 : 1} label="Amount to buy" />
              <span>{item.unit || unitWord}</span>
            </div>
            <div className="row nowrap" style={{ width: "100%" }}>
              <button className="btn ghost" onClick={() => setPhase("choose")}>
                Back
              </button>
              <button
                className="btn grow"
                disabled={buyAmount <= 0}
                onClick={() => {
                  setPending("some");
                  setPhase("qty");
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {phase === "qty" && (
          <div className="stack" style={{ alignItems: "center", marginTop: 8 }}>
            {product ? (
              <p>
                How many {byPound ? "pounds" : ""} of <strong>{productLabel(product)}</strong> to buy?
              </p>
            ) : (
              <p>
                No product is linked yet, so you'll add this in the store app by hand. How many to buy?
              </p>
            )}
            <Stepper large value={quantity} onChange={setQuantity} min={byPound ? 0.25 : 1} step={byPound ? 0.25 : 1} label="Quantity" />
            <div className="row nowrap" style={{ width: "100%" }}>
              <button className="btn ghost" onClick={() => setPhase(pending === "some" ? "some" : "choose")}>
                Back
              </button>
              <button
                className="btn grow"
                onClick={() =>
                  onAnswer(pending === "all" ? { choice: "all", quantity } : { choice: "some", buyAmount, quantity })
                }
              >
                Done
              </button>
            </div>
          </div>
        )}
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
      {answer && <p className="small muted">Answered before: {describeChoice(item, answer, grocery)}</p>}
    </>
  );
}

function MissingAmount({
  use,
  unitWord,
  onSave,
}: {
  use: { ingredientId: number; recipeName: string; cookingAmount: string };
  unitWord: string;
  onSave: (ingredientId: number, amount: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="note">
      <div>
        {use.recipeName} uses <strong>{use.cookingAmount || "some"}</strong>. It has no buying amount yet.
      </div>
      {!editing ? (
        <button className="btn plain small" onClick={() => setEditing(true)}>
          Set the buying amount
        </button>
      ) : (
        <form
          className="row nowrap"
          style={{ marginTop: 6 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(value);
            if (!(n > 0)) return;
            setSaving(true);
            try {
              await onSave(use.ingredientId, n);
            } catch (err) {
              toast((err as Error).message);
              setSaving(false);
            }
          }}
        >
          <input className="compact" type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Buying amount in ${unitWord}`} autoFocus />
          <span>{unitWord}</span>
          <button className="btn small" disabled={saving}>
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function Essentials({ state, setState }: StepProps) {
  const { lists, groceryById } = useData();
  const essentials = lists.find((l) => l.kind === "essentials");
  if (!essentials) return <p className="empty">There's no Essentials list yet.</p>;
  if (essentials.items.length === 0) {
    return (
      <p className="empty">
        The Essentials list is empty. <Link href={`/lists/${essentials.id}`}>Add essentials</Link>
      </p>
    );
  }
  const lowCount = essentials.items.filter((i) => state.essentials[i.groceryId]).length;
  return (
    <>
      <p className="muted">Tap the ones that are low this week. {lowCount > 0 && `${lowCount} marked.`}</p>
      <div className="list">
        {essentials.items.map((item) => {
          const qty = state.essentials[item.groceryId];
          const on = qty !== undefined;
          const grocery = groceryById.get(item.groceryId);
          const toggle = () =>
            setState((s) => {
              const next = { ...s.essentials };
              if (on) delete next[item.groceryId];
              else next[item.groceryId] = 1;
              return { ...s, essentials: next };
            });
          return (
            <div key={item.id} className="li">
              <button className={`tick${on ? " on" : ""}`} aria-pressed={on} aria-label={`${item.groceryName} is low`} onClick={toggle}>
                {on ? "✓" : ""}
              </button>
              <button className="grow" style={{ border: 0, background: "none", textAlign: "left", padding: 0 }} onClick={toggle}>
                <span className="name">{item.groceryName}</span>
                {item.details && (
                  <>
                    <br />
                    <span className="small muted">{item.details}</span>
                  </>
                )}
              </button>
              {on ? (
                <Stepper
                  value={qty}
                  min={qtyStep(grocery)}
                  step={qtyStep(grocery)}
                  onChange={(n) => setState((s) => ({ ...s, essentials: { ...s.essentials, [item.groceryId]: n } }))}
                  label={`How many ${item.groceryName}`}
                />
              ) : (
                <StoreBadge product={grocery?.product ?? null} />
              )}
            </div>
          );
        })}
      </div>
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
