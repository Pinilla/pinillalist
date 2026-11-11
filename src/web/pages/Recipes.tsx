import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { formatBuyingAmount, formatNumber } from "../../shared/amounts.ts";
import type { IngredientRow, Recipe } from "../../shared/types.ts";
import { api, photoUrl } from "../api.ts";
import { Page, Thumb, minutes, toast } from "../components.tsx";
import { useData } from "../data.tsx";

export function RecipesPage() {
  const { recipes, collections } = useData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<number | null>(null);
  const shown = recipes.filter(
    (r) => (filter === null || r.collectionIds.includes(filter)) && (!query || r.name.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <Page
      title="Recipes"
      actions={
        <Link className="btn small" href="/recipes/new">
          New recipe
        </Link>
      }
    >
      <input type="search" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
      <div className="chips" role="group" aria-label="Collections">
        <button className={`chip${filter === null ? " on" : ""}`} onClick={() => setFilter(null)}>
          All
        </button>
        {collections.map((c) => (
          <button key={c.id} className={`chip${filter === c.id ? " on" : ""}`} onClick={() => setFilter(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">No recipes here.</p>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <Link key={r.id} className="tile" href={`/recipes/${r.id}`}>
              <Thumb photo={r.photo} name={r.name} className="tile-img" />
              <span className="t">{r.name}</span>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

function useRecipe(id: number) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<Recipe>(`/api/recipes/${id}`)
      .then(setRecipe)
      .catch((e: Error) => setError(e.message));
  }, [id]);
  return { recipe, error };
}

export function RecipePage({ id }: { id: number }) {
  const { recipe, error } = useRecipe(id);
  const { collections, groceryById } = useData();
  if (error) return <Page title="Recipe">{error}</Page>;
  if (!recipe) return <main className="wrap empty">Loading…</main>;
  const cols = collections.filter((c) => recipe.collectionIds.includes(c.id));
  const facts = [
    recipe.servings && `Serves ${recipe.servings}`,
    recipe.prepTime && `Prep ${minutes(recipe.prepTime)}`,
    recipe.cookTime && `Cook ${minutes(recipe.cookTime)}`,
    recipe.rating && `${"★".repeat(recipe.rating)}`,
  ].filter(Boolean);
  const needAmounts = recipe.ingredients.filter((i) => i.kind === "ingredient" && i.buyingAmount === null).length;

  return (
    <Page
      title={recipe.name}
      back={
        <Link className="btn plain" href="/recipes">
          ← Recipes
        </Link>
      }
      actions={
        <Link className="btn small ghost" href={`/recipes/${recipe.id}/edit`}>
          Edit
        </Link>
      }
    >
      <div className="stack recipe-cols">
        <div className="stack">
          {recipe.photo && <img className="hero" src={photoUrl(recipe.photo)!} alt="" />}
          {cols.length > 0 && (
            <div className="row">
              {cols.map((c) => (
                <span key={c.id} className="badge">
                  {c.name}
                </span>
              ))}
            </div>
          )}
          {facts.length > 0 && <p className="muted">{facts.join(" · ")}</p>}
          <h2>Ingredients</h2>
          {needAmounts > 0 && (
            <p className="note">
              {needAmounts} ingredient{needAmounts === 1 ? " has" : "s have"} no buying amount yet. Edit the recipe to add them, or set them during
              the stock check.
            </p>
          )}
          <div className="list">
            {recipe.ingredients.map((row) =>
              row.kind === "heading" ? (
                <div key={row.id} className="li heading">
                  <span className="label">{row.text}</span>
                </div>
              ) : (
                <div key={row.id} className="li">
                  <span className="grow">
                    {row.cookingAmount && <strong>{row.cookingAmount} </strong>}
                    <Link href={`/catalog/${row.groceryId}`}>{row.groceryName}</Link>
                    {row.preparation && <span className="muted">, {row.preparation}</span>}
                  </span>
                  {row.buyingAmount !== null ? (
                    <span className="badge" title="Buying amount">
                      {formatBuyingAmount(row.buyingAmount, groceryById.get(row.groceryId)?.unit ?? "", row.groceryName)}
                    </span>
                  ) : (
                    <span className="badge warn">no buying amount</span>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
        <div className="stack">
          {recipe.steps.length > 0 && (
            <>
              <h2>Steps</h2>
              <ol className="steps-list">
                {recipe.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {recipe.note && (
            <>
              <h2>Note</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{recipe.note}</p>
            </>
          )}
          {(recipe.sourceName || recipe.sourceUrl) && (
            <p className="small muted">
              Source:{" "}
              {recipe.sourceUrl ? (
                <a href={/^https?:/.test(recipe.sourceUrl) ? recipe.sourceUrl : `https://${recipe.sourceUrl}`} target="_blank" rel="noopener noreferrer">
                  {recipe.sourceName || recipe.sourceUrl}
                </a>
              ) : (
                recipe.sourceName
              )}
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}

type EditRow =
  | { key: number; kind: "heading"; text: string }
  | { key: number; kind: "ingredient"; groceryName: string; cookingAmount: string; preparation: string; buyingAmount: string };

let nextKey = 1;

function toEditRow(row: IngredientRow): EditRow {
  return row.kind === "heading"
    ? { key: nextKey++, kind: "heading", text: row.text }
    : {
        key: nextKey++,
        kind: "ingredient",
        groceryName: row.groceryName,
        cookingAmount: row.cookingAmount,
        preparation: row.preparation,
        buyingAmount: row.buyingAmount === null ? "" : formatNumber(row.buyingAmount),
      };
}

const blankIngredient = (): EditRow => ({ key: nextKey++, kind: "ingredient", groceryName: "", cookingAmount: "", preparation: "", buyingAmount: "" });

export function RecipeEditPage({ id }: { id: number | null }) {
  const [, navigate] = useLocation();
  const { collections, groceries, reload } = useData();
  const [loading, setLoading] = useState(id !== null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("");
  const [prep, setPrep] = useState("");
  const [cook, setCook] = useState("");
  const [steps, setSteps] = useState("");
  const [note, setNote] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [collectionIds, setCollectionIds] = useState<number[]>([]);
  const [rows, setRows] = useState<EditRow[]>([blankIngredient()]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    api.get<Recipe>(`/api/recipes/${id}`).then((r) => {
      setName(r.name);
      setServings(r.servings);
      setPrep(r.prepTime ? String(Math.round(r.prepTime / 60)) : "");
      setCook(r.cookTime ? String(Math.round(r.cookTime / 60)) : "");
      setSteps(r.steps.join("\n\n"));
      setNote(r.note);
      setSourceName(r.sourceName);
      setSourceUrl(r.sourceUrl);
      setRating(r.rating);
      setCollectionIds(r.collectionIds);
      setRows(r.ingredients.length ? r.ingredients.map(toEditRow) : [blankIngredient()]);
      setLoading(false);
    });
  }, [id]);

  const update = (key: number, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...patch } as EditRow) : r)));
  const move = (index: number, by: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, row!);
      return next;
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const mins = (v: string) => (v.trim() && Number(v) > 0 ? Math.round(Number(v) * 60) : null);
    const body = {
      name,
      servings,
      prepTime: mins(prep),
      cookTime: mins(cook),
      steps: steps.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
      note,
      sourceName,
      sourceUrl,
      rating,
      collectionIds,
      ingredients: rows.map((r) =>
        r.kind === "heading"
          ? { kind: "heading", text: r.text }
          : {
              kind: "ingredient",
              groceryName: r.groceryName,
              cookingAmount: r.cookingAmount,
              preparation: r.preparation,
              buyingAmount: r.buyingAmount.trim() === "" ? null : Number(r.buyingAmount),
            },
      ),
    };
    try {
      let saved = id === null ? await api.post<Recipe>("/api/recipes", body) : await api.put<Recipe>(`/api/recipes/${id}`, body);
      if (photo) {
        const form = new FormData();
        form.set("photo", photo);
        saved = await api.put<Recipe>(`/api/recipes/${saved.id}/photo`, form);
      }
      await reload(["recipes", "groceries"]);
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      toast((err as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id === null || !confirm(`Delete ${name}? This can't be undone.`)) return;
    await api.del(`/api/recipes/${id}`);
    await reload(["recipes"]);
    navigate("/recipes");
  };

  if (loading) return <main className="wrap empty">Loading…</main>;

  const unitFor = (groceryName: string) => {
    const g = groceries.find((x) => x.name.toLowerCase() === groceryName.trim().toLowerCase());
    return g ? g.unit || g.name.toLowerCase() : "";
  };

  return (
    <Page
      title={id === null ? "New recipe" : "Edit recipe"}
      width="medium"
      back={
        <Link className="btn plain" href={id === null ? "/recipes" : `/recipes/${id}`}>
          ← Cancel
        </Link>
      }
    >
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <span>Collections</span>
          <div className="row">
            {collections.map((c) => {
              const on = collectionIds.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`chip${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setCollectionIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="two">
          <label className="field">
            <span>Prep minutes</span>
            <input type="number" inputMode="numeric" min="0" value={prep} onChange={(e) => setPrep(e.target.value)} />
          </label>
          <label className="field">
            <span>Cook minutes</span>
            <input type="number" inputMode="numeric" min="0" value={cook} onChange={(e) => setCook(e.target.value)} />
          </label>
        </div>
        <div className="two">
          <label className="field">
            <span>Servings</span>
            <input type="text" value={servings} onChange={(e) => setServings(e.target.value)} />
          </label>
          <label className="field">
            <span>Rating</span>
            <select value={rating ?? ""} onChange={(e) => setRating(e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>

        <h2>Ingredients</h2>
        <p className="small muted">
          The buying amount is how much of the grocery to buy, in the unit you count at home, such as 1 onion for "1 cup diced onion".
        </p>
        <datalist id="grocery-names">
          {groceries.map((g) => (
            <option key={g.id} value={g.name} />
          ))}
        </datalist>
        <div className="list">
          {rows.map((row, i) => (
            <div key={row.key} className="ing-row">
              {row.kind === "heading" ? (
                <label className="field full heading-field">
                  <span>Section heading</span>
                  <input type="text" value={row.text} onChange={(e) => update(row.key, { text: e.target.value })} placeholder="For the sauce" />
                </label>
              ) : (
                <>
                  <label className="field full">
                    <span>Grocery</span>
                    <input
                      type="text"
                      list="grocery-names"
                      value={row.groceryName}
                      onChange={(e) => update(row.key, { groceryName: e.target.value })}
                      placeholder="Onion"
                    />
                  </label>
                  <label className="field">
                    <span>Cooking amount</span>
                    <input type="text" value={row.cookingAmount} onChange={(e) => update(row.key, { cookingAmount: e.target.value })} placeholder="1 cup" />
                  </label>
                  <label className="field">
                    <span>Preparation</span>
                    <input type="text" value={row.preparation} onChange={(e) => update(row.key, { preparation: e.target.value })} placeholder="diced" />
                  </label>
                  <label className="field full">
                    <span>Buying amount{unitFor(row.groceryName) && ` (${unitFor(row.groceryName)})`}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={row.buyingAmount}
                      onChange={(e) => update(row.key, { buyingAmount: e.target.value })}
                    />
                  </label>
                </>
              )}
              <div className="row full">
                <button type="button" className="btn plain small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑ Up
                </button>
                <button type="button" className="btn plain small" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓ Down
                </button>
                <span className="grow" />
                <button type="button" className="btn plain small warn-text" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={() => setRows((rs) => [...rs, blankIngredient()])}>
            Add ingredient
          </button>
          <button type="button" className="btn ghost small" onClick={() => setRows((rs) => [...rs, { key: nextKey++, kind: "heading", text: "" }])}>
            Add heading
          </button>
        </div>

        <label className="field">
          <span>Steps</span>
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Leave a blank line between steps." />
        </label>
        <label className="field">
          <span>Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 80 }} />
        </label>
        <div className="two">
          <label className="field">
            <span>Source name</span>
            <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          </label>
          <label className="field">
            <span>Source link</span>
            <input type="text" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </label>
        </div>
        <button className="btn big" disabled={saving}>
          {saving ? "Saving…" : "Save recipe"}
        </button>
        {id !== null && (
          <button type="button" className="btn danger" onClick={remove}>
            Delete recipe
          </button>
        )}
      </form>
    </Page>
  );
}
