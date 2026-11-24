import { useReducer, useState } from "react";
import { Link, useLocation } from "wouter";
import { filterRecipes } from "../../shared/filters.ts";
import type { IngredientRow, Recipe, RecipeSummary } from "../../shared/types.ts";
import { api, photoUrl } from "../api.ts";
import { CollectionChips, Page, Thumb, minutes, toast } from "../components.tsx";
import { useData, useRecipe } from "../data.tsx";
import { blankForm, formFromRecipe, formToBody, updateForm, type FormAction, type FormRow, type IngredientFields, type RecipeForm } from "../recipe-form.ts";

type FormDispatch = (action: FormAction) => void;

export function RecipesPage() {
  const { recipes, collections } = useData();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
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
      <CollectionChips collections={collections} chosen={chosen} onChange={setChosen} />
      <RecipeTiles recipes={filterRecipes(recipes, chosen, query)} />
    </Page>
  );
}

export function RecipePage({ id }: { id: number }) {
  const { recipe, error } = useRecipe(id);
  if (error) return <Page title="Recipe">{error}</Page>;
  if (!recipe) return <main className="wrap empty">Loading…</main>;
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
          <CollectionBadges recipe={recipe} />
          <RecipeFacts recipe={recipe} />
          <h2>Ingredients</h2>
          <div className="list">
            {recipe.ingredients.map((row) => (
              <IngredientLine key={row.id} row={row} />
            ))}
          </div>
        </div>
        <div className="stack">
          <StepList steps={recipe.steps} />
          <RecipeNote note={recipe.note} />
          <SourceLine recipe={recipe} />
        </div>
      </div>
    </Page>
  );
}

export function RecipeEditPage({ id }: { id: number | null }) {
  const { recipe, error } = useRecipe(id);
  if (id === null) return <RecipeEditor id={null} initial={blankForm()} />;
  if (error) return <Page title="Recipe">{error}</Page>;
  if (!recipe) return <main className="wrap empty">Loading…</main>;
  return <RecipeEditor id={id} initial={formFromRecipe(recipe)} />;
}

function RecipeTiles({ recipes }: { recipes: RecipeSummary[] }) {
  if (recipes.length === 0) return <p className="empty">No recipes here.</p>;
  return (
    <div className="grid">
      {recipes.map((r) => (
        <Link key={r.id} className="tile" href={`/recipes/${r.id}`}>
          <Thumb photo={r.photo} name={r.name} className="tile-img" />
          <span className="t">{r.name}</span>
        </Link>
      ))}
    </div>
  );
}

function CollectionBadges({ recipe }: { recipe: Recipe }) {
  const { collections } = useData();
  const mine = collections.filter((c) => recipe.collectionIds.includes(c.id));
  if (mine.length === 0) return null;
  return (
    <div className="row">
      {mine.map((c) => (
        <span key={c.id} className="badge">
          {c.name}
        </span>
      ))}
    </div>
  );
}

function RecipeFacts({ recipe }: { recipe: Recipe }) {
  const facts = recipeFacts(recipe);
  if (facts.length === 0) return null;
  return <p className="muted">{facts.join(" · ")}</p>;
}

function recipeFacts(recipe: Recipe): string[] {
  return [
    recipe.servings && `Serves ${recipe.servings}`,
    recipe.prepTime && `Prep ${minutes(recipe.prepTime)}`,
    recipe.cookTime && `Cook ${minutes(recipe.cookTime)}`,
    recipe.rating && "★".repeat(recipe.rating),
  ].filter((fact): fact is string => Boolean(fact));
}

function IngredientLine({ row }: { row: IngredientRow }) {
  if (row.kind === "heading") {
    return (
      <div className="li heading">
        <span className="label">{row.text}</span>
      </div>
    );
  }
  return (
    <div className="li">
      <span className="grow">
        {row.cookingAmount && <strong>{row.cookingAmount} </strong>}
        <Link href={`/catalog/${row.groceryId}`}>{row.groceryName}</Link>
        {row.preparation && <span className="muted">, {row.preparation}</span>}
        {row.subRecipe && (
          <>
            <br />
            <span className="small">
              Made from <Link href={`/recipes/${row.subRecipe.id}`}>{row.subRecipe.name}</Link>
            </span>
          </>
        )}
      </span>
      {row.optional && <span className="badge">optional</span>}
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <>
      <h2>Steps</h2>
      <ol className="steps-list">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </>
  );
}

function RecipeNote({ note }: { note: string }) {
  if (!note) return null;
  return (
    <>
      <h2>Note</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{note}</p>
    </>
  );
}

function SourceLine({ recipe }: { recipe: Recipe }) {
  const { sourceName, sourceUrl } = recipe;
  if (!sourceName && !sourceUrl) return null;
  return (
    <p className="small muted">
      Source:{" "}
      {sourceUrl ? (
        <a href={absoluteUrl(sourceUrl)} target="_blank" rel="noopener noreferrer">
          {sourceName || sourceUrl}
        </a>
      ) : (
        sourceName
      )}
    </p>
  );
}

function absoluteUrl(url: string): string {
  return /^https?:/.test(url) ? url : `https://${url}`;
}

function RecipeEditor({ id, initial }: { id: number | null; initial: RecipeForm }) {
  const [, navigate] = useLocation();
  const { reload } = useData();
  const [form, dispatch] = useReducer(updateForm, initial);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveRecipe(id, form, photo);
      await reload(["recipes", "groceries"]);
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      toast((err as Error).message);
      setSaving(false);
    }
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
          <input type="text" value={form.name} onChange={(e) => dispatch({ type: "setText", field: "name", value: e.target.value })} required />
        </label>
        <CollectionPicker chosen={form.collectionIds} dispatch={dispatch} />
        <TimeAndServingFields form={form} dispatch={dispatch} />
        <label className="field">
          <span>Photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <IngredientEditor recipeId={id} rows={form.rows} dispatch={dispatch} />
        <NotesFields form={form} dispatch={dispatch} />
        <button className="btn big" disabled={saving}>
          {saving ? "Saving…" : "Save recipe"}
        </button>
        {id !== null && <DeleteRecipeButton id={id} name={form.name} />}
      </form>
    </Page>
  );
}

async function saveRecipe(id: number | null, form: RecipeForm, photo: File | null): Promise<Recipe> {
  const body = formToBody(form);
  const saved = id === null ? await api.post<Recipe>("/api/recipes", body) : await api.put<Recipe>(`/api/recipes/${id}`, body);
  if (!photo) return saved;
  const upload = new FormData();
  upload.set("photo", photo);
  return api.put<Recipe>(`/api/recipes/${saved.id}/photo`, upload);
}

function CollectionPicker({ chosen, dispatch }: { chosen: number[]; dispatch: FormDispatch }) {
  const { collections } = useData();
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <span>Collections</span>
      <div className="row">
        {collections.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <button type="button" key={c.id} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => dispatch({ type: "toggleCollection", collectionId: c.id })}>
              {c.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TimeAndServingFields({ form, dispatch }: { form: RecipeForm; dispatch: FormDispatch }) {
  const setText = (field: "prepMinutes" | "cookMinutes" | "servings") => (e: React.ChangeEvent<HTMLInputElement>) =>
    dispatch({ type: "setText", field, value: e.target.value });
  return (
    <>
      <div className="two">
        <label className="field">
          <span>Prep minutes</span>
          <input type="number" inputMode="numeric" min="0" value={form.prepMinutes} onChange={setText("prepMinutes")} />
        </label>
        <label className="field">
          <span>Cook minutes</span>
          <input type="number" inputMode="numeric" min="0" value={form.cookMinutes} onChange={setText("cookMinutes")} />
        </label>
      </div>
      <div className="two">
        <label className="field">
          <span>Servings</span>
          <input type="text" value={form.servings} onChange={setText("servings")} />
        </label>
        <label className="field">
          <span>Rating</span>
          <select value={form.rating ?? ""} onChange={(e) => dispatch({ type: "setRating", rating: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function IngredientEditor({ recipeId, rows, dispatch }: { recipeId: number | null; rows: FormRow[]; dispatch: FormDispatch }) {
  const { groceries } = useData();
  return (
    <>
      <h2>Ingredients</h2>
      <datalist id="grocery-names">
        {groceries.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
      <div className="list">
        {rows.map((row, i) => (
          <div key={row.key} className="ing-row">
            {row.kind === "heading" ? (
              <HeadingFields text={row.text} onChange={(text) => dispatch({ type: "editHeading", key: row.key, text })} />
            ) : (
              <IngredientFieldset row={row} recipeId={recipeId} onChange={(fields) => dispatch({ type: "editIngredient", key: row.key, fields })} />
            )}
            <RowControls index={i} count={rows.length} onMove={(by) => dispatch({ type: "moveRow", index: i, by })} onRemove={() => dispatch({ type: "removeRow", key: row.key })} />
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn ghost small" onClick={() => dispatch({ type: "addIngredient" })}>
          Add ingredient
        </button>
        <button type="button" className="btn ghost small" onClick={() => dispatch({ type: "addHeading" })}>
          Add heading
        </button>
      </div>
    </>
  );
}

function HeadingFields({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <label className="field full heading-field">
      <span>Section heading</span>
      <input type="text" value={text} onChange={(e) => onChange(e.target.value)} placeholder="For the sauce" />
    </label>
  );
}

function IngredientFieldset({
  row,
  recipeId,
  onChange,
}: {
  row: Extract<FormRow, { kind: "ingredient" }>;
  recipeId: number | null;
  onChange: (fields: IngredientFields) => void;
}) {
  return (
    <>
      <label className="field full">
        <span>Grocery</span>
        <input type="text" list="grocery-names" value={row.groceryName} onChange={(e) => onChange({ groceryName: e.target.value })} placeholder="Onion" />
      </label>
      <label className="field">
        <span>Cooking amount</span>
        <input type="text" value={row.cookingAmount} onChange={(e) => onChange({ cookingAmount: e.target.value })} placeholder="1 cup" />
      </label>
      <label className="field">
        <span>Preparation</span>
        <input type="text" value={row.preparation} onChange={(e) => onChange({ preparation: e.target.value })} placeholder="diced" />
      </label>
      <div className="row full extras">
        <label className="check-inline">
          <input type="checkbox" checked={row.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
          Optional
        </label>
        <SubRecipeSelect value={row.subRecipeId} excludeId={recipeId} onChange={(subRecipeId) => onChange({ subRecipeId })} />
      </div>
    </>
  );
}

function SubRecipeSelect({ value, excludeId, onChange }: { value: string; excludeId: number | null; onChange: (value: string) => void }) {
  const { recipes } = useData();
  return (
    <label className="field grow">
      <span>Made from recipe</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None, it's bought</option>
        {recipes
          .filter((r) => r.id !== excludeId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function RowControls({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (by: number) => void; onRemove: () => void }) {
  return (
    <div className="row full">
      <button type="button" className="btn plain small" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
        ↑ Up
      </button>
      <button type="button" className="btn plain small" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
        ↓ Down
      </button>
      <span className="grow" />
      <button type="button" className="btn plain small warn-text" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function NotesFields({ form, dispatch }: { form: RecipeForm; dispatch: FormDispatch }) {
  const setText = (field: "steps" | "note" | "sourceName" | "sourceUrl") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    dispatch({ type: "setText", field, value: e.target.value });
  return (
    <>
      <label className="field">
        <span>Steps</span>
        <textarea value={form.steps} onChange={setText("steps")} placeholder="Leave a blank line between steps." />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea value={form.note} onChange={setText("note")} style={{ minHeight: 80 }} />
      </label>
      <div className="two">
        <label className="field">
          <span>Source name</span>
          <input type="text" value={form.sourceName} onChange={setText("sourceName")} />
        </label>
        <label className="field">
          <span>Source link</span>
          <input type="text" inputMode="url" value={form.sourceUrl} onChange={setText("sourceUrl")} />
        </label>
      </div>
    </>
  );
}

function DeleteRecipeButton({ id, name }: { id: number; name: string }) {
  const [, navigate] = useLocation();
  const { reload } = useData();
  const remove = async () => {
    if (!confirm(`Delete ${name}? This can't be undone.`)) return;
    await api.del(`/api/recipes/${id}`);
    await reload(["recipes"]);
    navigate("/recipes");
  };
  return (
    <button type="button" className="btn danger" onClick={remove}>
      Delete recipe
    </button>
  );
}
