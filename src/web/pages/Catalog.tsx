import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { parseProductLink } from "../../shared/links.ts";
import { STORE_NAMES, type Grocery } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Page, StoreBadge, productLabel, productUrl, toast } from "../components.tsx";
import { useData } from "../data.tsx";

type Usage = Record<number, { recipes: number; lists: number }>;

function useUsage() {
  const [usage, setUsage] = useState<Usage>({});
  useEffect(() => {
    api.get<Usage>("/api/groceries/usage").then(setUsage).catch(() => {});
  }, []);
  return usage;
}

function usageText(u: { recipes: number; lists: number } | undefined): string {
  if (!u) return "Not used";
  return [u.recipes && `${u.recipes} recipe${u.recipes === 1 ? "" : "s"}`, u.lists && `${u.lists} list${u.lists === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(", ");
}

interface Suggestion {
  id: number;
  a: Grocery;
  b: Grocery;
}

export function CatalogPage() {
  const { groceries } = useData();
  const usage = useUsage();
  const [query, setQuery] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  useEffect(() => {
    api.get<Suggestion[]>("/api/merge-suggestions").then(setSuggestions).catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();
  const shown = groceries.filter((g) => (!q || g.name.toLowerCase().includes(q)) && (!onlyUnlinked || !g.product));
  const linked = groceries.filter((g) => g.product).length;

  return (
    <Page title="Catalog">
      <p className="muted">
        {groceries.length} groceries, {linked} linked to a product.
      </p>
      {suggestions.length > 0 && (
        <Link className="note info" href="/catalog/duplicates" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>
            {suggestions.length} possible duplicate{suggestions.length === 1 ? "" : "s"}
          </strong>{" "}
          to merge or keep apart →
        </Link>
      )}
      <input type="search" placeholder="Search groceries" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search groceries" />
      <label className="check">
        <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
        Only groceries without a product
      </label>
      <div className="list">
        {shown.map((g) => (
          <Link key={g.id} className="li" href={`/catalog/${g.id}`}>
            <span className="grow">
              <span className="name">{g.name}</span>
              <br />
              <span className="small muted">
                {g.unit ? `Counted in ${g.unit}. ` : ""}
                {usageText(usage[g.id])}
              </span>
            </span>
            <StoreBadge product={g.product} />
          </Link>
        ))}
        {shown.length === 0 && <p className="empty">No groceries match.</p>}
      </div>
      <form method="post" action="/logout">
        <button className="btn plain">Log out of this phone</button>
      </form>
    </Page>
  );
}

export function GroceryPage({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { groceryById, groceries, setGrocery, reload } = useData();
  const usage = useUsage();
  const grocery = groceryById.get(id);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [link, setLink] = useState("");
  const [productName, setProductName] = useState("");
  const [size, setSize] = useState("");
  const [byPound, setByPound] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!grocery) return;
    setName(grocery.name);
    setUnit(grocery.unit);
    setProductName(grocery.product?.name ?? "");
    setSize(grocery.product?.size ?? "");
    setByPound(grocery.product?.soldBy === "pound");
    setLink("");
  }, [grocery]);

  if (!grocery) return <main className="wrap empty">Loading…</main>;

  const parsed = link.trim() ? parseProductLink(link) : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setGrocery(await api.patch<Grocery>(`/api/groceries/${id}`, { name, unit }));
      toast("Saved.");
    });
  };

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const sourceLink = link.trim() || (grocery.product ? productUrl(grocery.product) : "");
    void run(async () => {
      setGrocery(
        await api.put<Grocery>(`/api/groceries/${id}/product`, {
          link: sourceLink,
          name: productName,
          size,
          soldBy: byPound ? "pound" : "each",
        }),
      );
      setLink("");
      toast("Product linked.");
    });
  };

  const mergeTarget = groceries.find((g) => g.name.toLowerCase() === mergeInto.trim().toLowerCase() && g.id !== id);
  const u = usage[id];

  return (
    <Page
      title={grocery.name}
      back={
        <Link className="btn plain" href="/catalog">
          ← Catalog
        </Link>
      }
    >
      <p className="muted">{usageText(u)}</p>

      <section className="storebox">
        <h2>Product</h2>
        {grocery.product ? (
          <div className="row nowrap">
            <span className="grow">
              <strong>{productLabel(grocery.product)}</strong>
              <br />
              <span className="small muted">
                {STORE_NAMES[grocery.product.store]} {grocery.product.storeId}
                {grocery.product.soldBy === "pound" && ", sold by the pound"}
              </span>
            </span>
            <a className="btn small ghost" href={productUrl(grocery.product)} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
        ) : (
          <p className="muted">No product linked. The weekly order lists it to add by hand.</p>
        )}
        <form className="stack" onSubmit={saveProduct}>
          <label className="field">
            <span>{grocery.product ? "Paste a new product link" : "Paste a Walmart or Amazon product link"}</span>
            <input type="text" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.walmart.com/ip/…" />
          </label>
          {parsed && (
            <p className={`small ${parsed.ok ? "muted" : "warn-text"}`}>
              {parsed.ok ? `${STORE_NAMES[parsed.store]} product ${parsed.storeId}` : parsed.error}
            </p>
          )}
          <label className="field">
            <span>Product name</span>
            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Great Value Whole Milk" />
          </label>
          <label className="field">
            <span>Size</span>
            <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="1 gal" />
          </label>
          {(parsed?.ok ? parsed.store : grocery.product?.store) === "walmart" && (
            <label className="check">
              <input type="checkbox" checked={byPound} onChange={(e) => setByPound(e.target.checked)} />
              Sold by the pound (deli sliced to order)
            </label>
          )}
          <div className="row">
            <button className="btn" disabled={busy || (!grocery.product && !parsed?.ok) || (parsed !== null && !parsed.ok)}>
              {grocery.product && !link.trim() ? "Save product details" : "Link product"}
            </button>
            {grocery.product && (
              <button
                type="button"
                className="btn danger"
                disabled={busy}
                onClick={() => void run(async () => setGrocery(await api.del<Grocery>(`/api/groceries/${id}/product`)))}
              >
                Unlink
              </button>
            )}
          </div>
        </form>
      </section>

      <form className="storebox" onSubmit={saveDetails}>
        <h2>Details</h2>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Unit</span>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Leave empty to count by name" />
        </label>
        <p className="small muted">
          The unit you count at home and buy in, such as lb, can or pack. Leave it empty to count {grocery.name.toLowerCase()} one by one.
        </p>
        <button className="btn" disabled={busy}>
          Save details
        </button>
      </form>

      <form
        className="storebox"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mergeTarget) return;
          if (!confirm(`Merge ${grocery.name} into ${mergeTarget.name}? Recipes and lists will use ${mergeTarget.name}.`)) return;
          void run(async () => {
            await api.post(`/api/groceries/${id}/merge`, { intoId: mergeTarget.id });
            await reload(["groceries", "lists"]);
            navigate(`/catalog/${mergeTarget.id}`);
          });
        }}
      >
        <h2>Merge into another grocery</h2>
        <p className="small muted">For duplicates like "Yellow onion" and "Onion". Recipes and lists move to the other grocery.</p>
        <datalist id="merge-names">
          {groceries
            .filter((g) => g.id !== id)
            .map((g) => (
              <option key={g.id} value={g.name} />
            ))}
        </datalist>
        <input type="text" list="merge-names" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} placeholder="Grocery name" aria-label="Grocery to merge into" />
        <button className="btn ghost" disabled={busy || !mergeTarget}>
          Merge
        </button>
      </form>

      {!u && (
        <button
          className="btn danger"
          disabled={busy}
          onClick={() => {
            if (!confirm(`Delete ${grocery.name} from the catalog?`)) return;
            void run(async () => {
              await api.del(`/api/groceries/${id}`);
              await reload(["groceries"]);
              navigate("/catalog");
            });
          }}
        >
          Delete grocery
        </button>
      )}
    </Page>
  );
}

export function DuplicatesPage() {
  const { reload } = useData();
  const usage = useUsage();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Suggestion[]>("/api/merge-suggestions").then(setSuggestions);
  useEffect(() => {
    void load();
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([load(), reload(["groceries", "lists"])]);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Possible duplicates"
      back={
        <Link className="btn plain" href="/catalog">
          ← Catalog
        </Link>
      }
    >
      <p className="muted">The AnyList import found these pairs. Merge the ones that are the same thing to buy.</p>
      {suggestions === null && <p className="empty">Loading…</p>}
      {suggestions?.length === 0 && <p className="empty">Nothing left to review.</p>}
      {suggestions?.map((s) => (
        <section key={s.id} className="storebox">
          <div className="two">
            {[s.a, s.b].map((g) => (
              <div key={g.id}>
                <strong>{g.name}</strong>
                <br />
                <span className="small muted">{usageText(usage[g.id])}</span>
              </div>
            ))}
          </div>
          <div className="stack tight">
            <button className="btn small" disabled={busy} onClick={() => act(() => api.post(`/api/groceries/${s.b.id}/merge`, { intoId: s.a.id }))}>
              Merge into {s.a.name}
            </button>
            <button className="btn small" disabled={busy} onClick={() => act(() => api.post(`/api/groceries/${s.a.id}/merge`, { intoId: s.b.id }))}>
              Merge into {s.b.name}
            </button>
            <button className="btn small ghost" disabled={busy} onClick={() => act(() => api.post(`/api/merge-suggestions/${s.id}/keep`))}>
              Keep apart
            </button>
          </div>
        </section>
      ))}
    </Page>
  );
}
