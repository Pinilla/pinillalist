import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatNumber } from "../../shared/amounts.ts";
import type { GroceryList } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Page, toast } from "../components.tsx";
import { useData } from "../data.tsx";

export function ListsPage() {
  const { lists, setList } = useData();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  return (
    <Page title="Lists">
      <div className="list">
        {lists.map((l) => (
          <Link key={l.id} className="li" href={`/lists/${l.id}`}>
            <span className="grow">
              <span className="name">{l.name}</span>
              <br />
              <span className="small muted">
                {l.kind === "essentials" ? "Always kept on hand" : `${l.items.filter((i) => !i.done).length} to buy`}
                {l.isDefault && ", default list"}
              </span>
            </span>
            <span className="muted">{l.items.length}</span>
          </Link>
        ))}
        {lists.length === 0 && <p className="empty">No lists yet.</p>}
      </div>
      <form
        className="row nowrap"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const l = await api.post<GroceryList>("/api/lists", { name });
            setList(l);
            setName("");
            navigate(`/lists/${l.id}`);
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      >
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" aria-label="New list name" />
        <button className="btn" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </Page>
  );
}

export function ListPage({ id }: { id: number }) {
  const { lists, groceries, setList, reload } = useData();
  const [, navigate] = useLocation();
  const list = lists.find((l) => l.id === id);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");

  if (!list) return <main className="wrap empty">Loading…</main>;
  const essentials = list.kind === "essentials";

  const call = async (fn: () => Promise<GroceryList | null>) => {
    try {
      const l = await fn();
      if (l) setList(l);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const doneCount = list.items.filter((i) => i.done).length;

  return (
    <Page
      title={list.name}
      back={
        <Link className="btn plain" href="/lists">
          ← Lists
        </Link>
      }
      actions={
        <button
          className="btn small ghost"
          onClick={() => {
            setTitle(list.name);
            setRenaming((r) => !r);
          }}
        >
          {renaming ? "Close" : "Edit"}
        </button>
      }
    >
      {renaming && (
        <section className="storebox">
          <form
            className="row nowrap"
            onSubmit={(e) => {
              e.preventDefault();
              void call(() => api.patch<GroceryList>(`/api/lists/${id}`, { name: title }));
              setRenaming(false);
            }}
          >
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="List name" />
            <button className="btn">Rename</button>
          </form>
          {!essentials && !list.isDefault && (
            <button
              className="btn ghost"
              onClick={async () => {
                await call(() => api.patch<GroceryList>(`/api/lists/${id}`, { isDefault: true }));
                await reload(["lists"]);
              }}
            >
              Make this the default list
            </button>
          )}
          {!essentials && (
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm(`Delete ${list.name}?`)) return;
                await api.del(`/api/lists/${id}`);
                await reload(["lists"]);
                navigate("/lists");
              }}
            >
              Delete list
            </button>
          )}
        </section>
      )}
      {essentials && <p className="muted">These are never done. Each Saturday, mark the low ones in the weekly order.</p>}
      <datalist id="list-grocery-names">
        {groceries.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
      <form
        className="row nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          const n = amount.trim() ? Number(amount) : null;
          void call(() => api.post<GroceryList>(`/api/lists/${id}/items`, { groceryName: name, amount: n }));
          setName("");
          setAmount("");
        }}
      >
        <input type="text" list="list-grocery-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a grocery" aria-label="Grocery" />
        {!essentials && (
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amt"
            aria-label="Amount"
            style={{ width: 80, flex: "none" }}
          />
        )}
        <button className="btn" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <div className="list">
        {list.items.map((item) => (
          <div key={item.id} className={`li${item.done ? " have" : ""}`}>
            {!essentials && (
              <button
                className={`tick${item.done ? " on" : ""}`}
                aria-pressed={item.done}
                aria-label={`${item.groceryName} done`}
                onClick={() => void call(() => api.patch<GroceryList>(`/api/list-items/${item.id}`, { done: !item.done }))}
              >
                {item.done ? "✓" : ""}
              </button>
            )}
            <span className="grow">
              <span className="name">
                {item.amount !== null && `${formatNumber(item.amount)} `}
                {item.groceryName}
              </span>
              {item.details && (
                <>
                  <br />
                  <span className="small muted">{item.details}</span>
                </>
              )}
            </span>
            <button
              className="btn plain small"
              aria-label={`Remove ${item.groceryName}`}
              onClick={() => void call(() => api.del<GroceryList>(`/api/list-items/${item.id}`))}
            >
              Remove
            </button>
          </div>
        ))}
        {list.items.length === 0 && <p className="empty">Nothing on this list.</p>}
      </div>
      {doneCount > 0 && (
        <button className="btn ghost" onClick={() => void call(() => api.post<GroceryList>(`/api/lists/${id}/clear-done`))}>
          Clear {doneCount} done item{doneCount === 1 ? "" : "s"}
        </button>
      )}
    </Page>
  );
}
