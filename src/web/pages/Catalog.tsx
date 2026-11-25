import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { parseProductLink } from "../../shared/links.ts";
import {
  LOCATIONS,
  locationLabel,
  locationRank,
  type LocationKey,
} from "../../shared/locations.ts";
import { STORE_NAMES, type Grocery } from "../../shared/types.ts";
import { api } from "../api.ts";
import {
  Page,
  Panel,
  StoreBadge,
  productLabel,
  productUrl,
  toast,
  useBusy,
  useDesktop,
} from "../components.tsx";
import { useData } from "../data.tsx";

type Usage = Record<number, { recipes: number; lists: number }>;

interface Suggestion {
  id: number;
  a: Grocery;
  b: Grocery;
}

type SortKey = "name" | "unit" | "location" | "usage" | "product";
type SortDirection = "ascending" | "descending";
type SortOrder = { key: SortKey; direction: SortDirection };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Grocery" },
  { key: "unit", label: "Unit" },
  { key: "location", label: "Location" },
  { key: "usage", label: "Used in" },
  { key: "product", label: "Product" },
];

export function CatalogPage({ selectedId }: { selectedId?: number }) {
  const desktop = useDesktop();
  const filter = useCatalogFilter();
  const usage = useUsage();
  return (
    <Page title="Catalog">
      <CatalogIntro />
      {desktop ? (
        <CatalogTable filter={filter} usage={usage} selectedId={selectedId} />
      ) : (
        <CatalogList filter={filter} usage={usage} />
      )}
    </Page>
  );
}

export function GroceryPage({ id }: { id: number }) {
  const { groceryById } = useData();
  const grocery = groceryById.get(id);
  if (!grocery) {
    return <main className="wrap empty">Loading…</main>;
  }
  return (
    <Page
      title={grocery.name}
      back={
        <Link className="btn plain" href="/catalog">
          ← Catalog
        </Link>
      }
    >
      <GroceryDetails grocery={grocery} />
    </Page>
  );
}

export function DuplicatesPage() {
  const { reload } = useData();
  const usage = useUsage();
  const { busy, run } = useBusy();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const load = () => api.get<Suggestion[]>("/api/merge-suggestions").then(setSuggestions);
  useEffect(() => {
    void load();
  }, []);

  const act = (request: () => Promise<unknown>) =>
    run(async () => {
      await request();
      await Promise.all([load(), reload(["groceries", "lists"])]);
    });

  return (
    <Page
      title="Possible duplicates"
      width="medium"
      back={
        <Link className="btn plain" href="/catalog">
          ← Catalog
        </Link>
      }
    >
      <p className="muted">
        The AnyList import found these pairs. Merge the ones that are the same thing to buy.
      </p>
      {suggestions === null && <p className="empty">Loading…</p>}
      {suggestions?.length === 0 && <p className="empty">Nothing left to review.</p>}
      {suggestions?.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} usage={usage} busy={busy} onAct={act} />
      ))}
    </Page>
  );
}

function useUsage(): Usage {
  const [usage, setUsage] = useState<Usage>({});
  useEffect(() => {
    api
      .get<Usage>("/api/groceries/usage")
      .then(setUsage)
      .catch(() => {});
  }, []);
  return usage;
}

function useSuggestionCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    api
      .get<Suggestion[]>("/api/merge-suggestions")
      .then((s) => setCount(s.length))
      .catch(() => {});
  }, []);
  return count;
}

function useCatalogFilter() {
  const { groceries } = useData();
  const [query, setQuery] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = groceries.filter(
    (g) => (!q || g.name.toLowerCase().includes(q)) && (!onlyUnlinked || !g.product),
  );
  return { query, setQuery, onlyUnlinked, setOnlyUnlinked, shown, total: groceries.length };
}

type CatalogFilter = ReturnType<typeof useCatalogFilter>;

function usageText(u: { recipes: number; lists: number } | undefined): string {
  if (!u) {
    return "Not used";
  }
  return [u.recipes && plural(u.recipes, "recipe"), u.lists && plural(u.lists, "list")]
    .filter(Boolean)
    .join(", ");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function CatalogIntro() {
  const { groceries } = useData();
  const suggestions = useSuggestionCount();
  const linked = groceries.filter((g) => g.product).length;
  return (
    <>
      <p className="muted">
        {groceries.length} groceries, {linked} linked to a product.
      </p>
      {suggestions > 0 && (
        <Link
          className="note info"
          href="/catalog/duplicates"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <strong>{plural(suggestions, "possible duplicate")}</strong> to merge or keep apart →
        </Link>
      )}
    </>
  );
}

function SearchBox({ filter }: { filter: CatalogFilter }) {
  return (
    <input
      type="search"
      placeholder="Search groceries"
      value={filter.query}
      onChange={(e) => filter.setQuery(e.target.value)}
      aria-label="Search groceries"
    />
  );
}

function UnlinkedToggle({ filter }: { filter: CatalogFilter }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={filter.onlyUnlinked}
        onChange={(e) => filter.setOnlyUnlinked(e.target.checked)}
      />
      Only groceries without a product
    </label>
  );
}

function CatalogList({ filter, usage }: { filter: CatalogFilter; usage: Usage }) {
  return (
    <>
      <SearchBox filter={filter} />
      <UnlinkedToggle filter={filter} />
      <div className="list">
        {filter.shown.map((g) => (
          <Link key={g.id} className="li" href={`/catalog/${g.id}`}>
            <span className="grow">
              <span className="name">{g.name}</span>
              <br />
              <span className="small muted">{groceryFacts(g, usage)}</span>
            </span>
            <StoreBadge product={g.product} />
          </Link>
        ))}
        {filter.shown.length === 0 && <p className="empty">No groceries match.</p>}
      </div>
      <form method="post" action="/logout">
        <button className="btn plain">Log out of this phone</button>
      </form>
    </>
  );
}

function groceryFacts(g: Grocery, usage: Usage): string {
  const where = g.location ? `${locationLabel(g.location)}. ` : "";
  const counted = g.unit ? `Counted in ${g.unit}. ` : "";
  return `${where}${counted}${usageText(usage[g.id])}`;
}

function CatalogTable({
  filter,
  usage,
  selectedId,
}: {
  filter: CatalogFilter;
  usage: Usage;
  selectedId?: number;
}) {
  const [, navigate] = useLocation();
  const [order, setOrder] = useState<SortOrder>({ key: "name", direction: "ascending" });
  const rows = sortGroceries(filter.shown, order, usage);
  return (
    <>
      <div className="toolbar row">
        <SearchBox filter={filter} />
        <UnlinkedToggle filter={filter} />
        {filter.shown.length !== filter.total && (
          <span className="muted small">{filter.shown.length} shown</span>
        )}
      </div>
      <div className={`split${selectedId === undefined ? "" : " open"}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <SortableHeader key={c.key} column={c} order={order} onSort={setOrder} />
                ))}
                <th className="label">Store</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <GroceryRow
                  key={g.id}
                  grocery={g}
                  usage={usage}
                  selected={g.id === selectedId}
                  onOpen={() => navigate(`/catalog/${g.id}`)}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">No groceries match.</p>}
        </div>
        {selectedId !== undefined && (
          <aside className="drawer" aria-label="Grocery details">
            <GroceryPanel key={selectedId} id={selectedId} />
          </aside>
        )}
      </div>
    </>
  );
}

function SortableHeader({
  column,
  order,
  onSort,
}: {
  column: { key: SortKey; label: string };
  order: SortOrder;
  onSort: (order: SortOrder) => void;
}) {
  const on = order.key === column.key;
  const next: SortDirection = on && order.direction === "ascending" ? "descending" : "ascending";
  return (
    <th aria-sort={on ? order.direction : undefined}>
      <button onClick={() => onSort({ key: column.key, direction: next })}>
        {column.label}
        <span aria-hidden="true">{on ? (order.direction === "descending" ? " ↓" : " ↑") : ""}</span>
      </button>
    </th>
  );
}

function GroceryRow({
  grocery,
  usage,
  selected,
  onOpen,
}: {
  grocery: Grocery;
  usage: Usage;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <tr className={selected ? "on" : ""} onClick={onOpen}>
      <td>
        <Link href={`/catalog/${grocery.id}`} onClick={(e) => e.stopPropagation()}>
          {grocery.name}
        </Link>
      </td>
      <td>{grocery.unit}</td>
      <td>
        {grocery.location ? locationLabel(grocery.location) : <span className="muted">None</span>}
      </td>
      <td>{usageText(usage[grocery.id])}</td>
      <td>
        {grocery.product ? productLabel(grocery.product) : <span className="muted">None</span>}
      </td>
      <td>
        <StoreBadge product={grocery.product} />
      </td>
    </tr>
  );
}

function sortGroceries(list: Grocery[], order: SortOrder, usage: Usage): Grocery[] {
  const flip = order.direction === "descending" ? -1 : 1;
  const compare = comparatorFor(order.key, usage);
  return [...list].sort((a, b) => compare(a, b, flip) || a.name.localeCompare(b.name));
}

type Comparator = (a: Grocery, b: Grocery, flip: number) => number;

function comparatorFor(key: SortKey, usage: Usage): Comparator {
  if (key === "usage") {
    return (a, b, flip) => flip * (usesOf(b, usage) - usesOf(a, usage));
  }
  if (key === "location") {
    return compareLocations;
  }
  return (a, b, flip) => compareText(sortText(a, key), sortText(b, key), flip);
}

function usesOf(g: Grocery, usage: Usage): number {
  return (usage[g.id]?.recipes ?? 0) + (usage[g.id]?.lists ?? 0);
}

function compareLocations(a: Grocery, b: Grocery, flip: number): number {
  if (!a.location !== !b.location) {
    return a.location ? -1 : 1;
  }
  return flip * (locationRank(a.location) - locationRank(b.location));
}

function compareText(x: string, y: string, flip: number): number {
  if (!x !== !y) {
    return x ? -1 : 1;
  }
  return flip * x.localeCompare(y);
}

function sortText(g: Grocery, key: SortKey): string {
  if (key === "unit") {
    return g.unit;
  }
  if (key === "product") {
    return g.product ? productLabel(g.product) : "";
  }
  return g.name;
}

function GroceryPanel({ id }: { id: number }) {
  const { groceryById } = useData();
  const grocery = groceryById.get(id);
  if (!grocery) {
    return <p className="empty">Loading…</p>;
  }
  return (
    <Panel
      title={grocery.name}
      actions={
        <Link className="btn plain small" href="/catalog">
          Close
        </Link>
      }
    >
      <GroceryDetails grocery={grocery} />
    </Panel>
  );
}

function GroceryDetails({ grocery }: { grocery: Grocery }) {
  const usage = useUsage();
  const used = usage[grocery.id];
  return (
    <>
      <p className="muted">{usageText(used)}</p>
      <ProductSection grocery={grocery} />
      <DetailsForm grocery={grocery} />
      <MergeForm grocery={grocery} />
      {!used && <DeleteGroceryButton grocery={grocery} />}
    </>
  );
}

function ProductSection({ grocery }: { grocery: Grocery }) {
  const { setGrocery } = useData();
  const { busy, run } = useBusy();
  const product = grocery.product;
  const [link, setLink] = useState("");
  const [productName, setProductName] = useState("");
  const [size, setSize] = useState("");
  const [byPound, setByPound] = useState(false);

  useEffect(() => {
    setProductName(grocery.product?.name ?? "");
    setSize(grocery.product?.size ?? "");
    setByPound(grocery.product?.soldBy === "pound");
    setLink("");
  }, [grocery]);

  const parsed = link.trim() ? parseProductLink(link) : null;
  const store = parsed?.ok ? parsed.store : product?.store;
  const canSave = (product !== null || parsed?.ok === true) && parsed?.ok !== false;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body = {
        link: link.trim() || (product ? productUrl(product) : ""),
        name: productName,
        size,
        soldBy: byPound ? "pound" : "each",
      };
      setGrocery(await api.put<Grocery>(`/api/groceries/${grocery.id}/product`, body));
      setLink("");
      toast("Product linked.");
    });
  };

  const unlink = () =>
    void run(async () =>
      setGrocery(await api.del<Grocery>(`/api/groceries/${grocery.id}/product`)),
    );

  return (
    <section className="storebox">
      <h2>Product</h2>
      <LinkedProduct grocery={grocery} />
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>
            {product ? "Paste a new product link" : "Paste a Walmart or Amazon product link"}
          </span>
          <input
            type="text"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.walmart.com/ip/…"
          />
        </label>
        {parsed && (
          <p className={`small ${parsed.ok ? "muted" : "warn-text"}`}>
            {parsed.ok ? `${STORE_NAMES[parsed.store]} product ${parsed.storeId}` : parsed.error}
          </p>
        )}
        <TextField
          label="Product name"
          value={productName}
          onChange={setProductName}
          placeholder="Great Value Whole Milk"
        />
        <TextField label="Size" value={size} onChange={setSize} placeholder="1 gal" />
        {store === "walmart" && (
          <label className="check">
            <input
              type="checkbox"
              checked={byPound}
              onChange={(e) => setByPound(e.target.checked)}
            />
            Sold by the pound (deli sliced to order)
          </label>
        )}
        <div className="row">
          <button className="btn" disabled={busy || !canSave}>
            {product && !link.trim() ? "Save product details" : "Link product"}
          </button>
          {product && (
            <button type="button" className="btn danger" disabled={busy} onClick={unlink}>
              Unlink
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function LinkedProduct({ grocery }: { grocery: Grocery }) {
  const product = grocery.product;
  if (!product) {
    return <p className="muted">No product linked. The weekly order lists it to add by hand.</p>;
  }
  return (
    <div className="row nowrap">
      <span className="grow">
        <strong>{productLabel(product)}</strong>
        <br />
        <span className="small muted">
          {STORE_NAMES[product.store]} {product.storeId}
          {product.soldBy === "pound" && ", sold by the pound"}
        </span>
      </span>
      <a
        className="btn small ghost"
        href={productUrl(product)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open
      </a>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function DetailsForm({ grocery }: { grocery: Grocery }) {
  const { setGrocery } = useData();
  const { busy, run } = useBusy();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<LocationKey | "">("");

  useEffect(() => {
    setName(grocery.name);
    setUnit(grocery.unit);
    setLocation(grocery.location ?? "");
  }, [grocery]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setGrocery(
        await api.patch<Grocery>(`/api/groceries/${grocery.id}`, {
          name,
          unit,
          location: location || null,
        }),
      );
      toast("Saved.");
    });
  };

  return (
    <form className="storebox" onSubmit={save}>
      <h2>Details</h2>
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <TextField
        label="Unit"
        value={unit}
        onChange={setUnit}
        placeholder="Leave empty to count by name"
      />
      <LocationField value={location} onChange={setLocation} />
      <p className="small muted">
        Where it's kept at home. The stock check walks the house in this order, and groceries
        without a location come last.
      </p>
      <p className="small muted">
        The unit you count at home and buy in, such as lb, can or pack. Leave it empty to count{" "}
        {grocery.name.toLowerCase()} one by one.
      </p>
      <button className="btn" disabled={busy}>
        Save details
      </button>
    </form>
  );
}

function LocationField({
  value,
  onChange,
}: {
  value: LocationKey | "";
  onChange: (value: LocationKey | "") => void;
}) {
  return (
    <label className="field">
      <span>Location</span>
      <select value={value} onChange={(e) => onChange(e.target.value as LocationKey | "")}>
        <option value="">None</option>
        {LOCATIONS.map((l) => (
          <option key={l.key} value={l.key}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MergeForm({ grocery }: { grocery: Grocery }) {
  const { groceries, reload } = useData();
  const [, navigate] = useLocation();
  const { busy, run } = useBusy();
  const [mergeInto, setMergeInto] = useState("");
  const others = groceries.filter((g) => g.id !== grocery.id);
  const target = others.find((g) => g.name.toLowerCase() === mergeInto.trim().toLowerCase());

  const merge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) {
      return;
    }
    if (
      !confirm(
        `Merge ${grocery.name} into ${target.name}? Recipes and lists will use ${target.name}.`,
      )
    ) {
      return;
    }
    void run(async () => {
      await api.post(`/api/groceries/${grocery.id}/merge`, { intoId: target.id });
      await reload(["groceries", "lists"]);
      navigate(`/catalog/${target.id}`);
    });
  };

  return (
    <form className="storebox" onSubmit={merge}>
      <h2>Merge into another grocery</h2>
      <p className="small muted">
        For duplicates like "Yellow onion" and "Onion". Recipes and lists move to the other grocery.
      </p>
      <datalist id="merge-names">
        {others.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
      <input
        type="text"
        list="merge-names"
        value={mergeInto}
        onChange={(e) => setMergeInto(e.target.value)}
        placeholder="Grocery name"
        aria-label="Grocery to merge into"
      />
      <button className="btn ghost" disabled={busy || !target}>
        Merge
      </button>
    </form>
  );
}

function DeleteGroceryButton({ grocery }: { grocery: Grocery }) {
  const { reload } = useData();
  const [, navigate] = useLocation();
  const { busy, run } = useBusy();
  const remove = () => {
    if (!confirm(`Delete ${grocery.name} from the catalog?`)) {
      return;
    }
    void run(async () => {
      await api.del(`/api/groceries/${grocery.id}`);
      await reload(["groceries"]);
      navigate("/catalog");
    });
  };
  return (
    <button className="btn danger" disabled={busy} onClick={remove}>
      Delete grocery
    </button>
  );
}

function SuggestionCard({
  suggestion,
  usage,
  busy,
  onAct,
}: {
  suggestion: Suggestion;
  usage: Usage;
  busy: boolean;
  onAct: (request: () => Promise<unknown>) => void;
}) {
  const { id, a, b } = suggestion;
  const merge = (from: Grocery, into: Grocery) =>
    onAct(() => api.post(`/api/groceries/${from.id}/merge`, { intoId: into.id }));
  return (
    <section className="storebox dup">
      <div className="two">
        {[a, b].map((g) => (
          <div key={g.id}>
            <strong>{g.name}</strong>
            <br />
            <span className="small muted">{usageText(usage[g.id])}</span>
          </div>
        ))}
      </div>
      <div className="stack tight">
        <button className="btn small" disabled={busy} onClick={() => merge(b, a)}>
          Merge into {a.name}
        </button>
        <button className="btn small" disabled={busy} onClick={() => merge(a, b)}>
          Merge into {b.name}
        </button>
        <button
          className="btn small ghost"
          disabled={busy}
          onClick={() => onAct(() => api.post(`/api/merge-suggestions/${id}/keep`))}
        >
          Keep apart
        </button>
      </div>
    </section>
  );
}
