import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatNumber } from "../../shared/amounts.ts";
import type { GroceryList, ListItem } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Page, Panel, toast, useDesktop } from "../components.tsx";
import { useData } from "../data.tsx";

type ListRequest = () => Promise<GroceryList | null>;

export function ListsPage({ selectedId }: { selectedId?: number }) {
  const { lists } = useData();
  const desktop = useDesktop();
  if (!desktop) {
    return (
      <Page title="Lists">
        <ListIndex />
        <AddListForm />
      </Page>
    );
  }
  const openId = selectedId ?? lists[0]?.id;
  return (
    <Page title="Lists">
      <div className="lists-split">
        <div className="stack">
          <ListIndex openId={openId} />
          <AddListForm />
        </div>
        {openId !== undefined && <ListPanel key={openId} id={openId} />}
      </div>
    </Page>
  );
}

export function ListPage({ id }: { id: number }) {
  const list = useList(id);
  const [renaming, setRenaming] = useState(false);
  if (!list) {
    return <main className="wrap empty">Loading…</main>;
  }
  return (
    <Page
      title={list.name}
      back={
        <Link className="btn plain" href="/lists">
          ← Lists
        </Link>
      }
      actions={<EditToggle open={renaming} onToggle={() => setRenaming((r) => !r)} />}
    >
      {renaming && <ListSettings list={list} onRenamed={() => setRenaming(false)} />}
      <ListBody list={list} />
    </Page>
  );
}

function ListPanel({ id }: { id: number }) {
  const list = useList(id);
  const [renaming, setRenaming] = useState(false);
  if (!list) {
    return <p className="empty">Loading…</p>;
  }
  return (
    <Panel
      title={list.name}
      actions={<EditToggle open={renaming} onToggle={() => setRenaming((r) => !r)} />}
    >
      {renaming && <ListSettings list={list} onRenamed={() => setRenaming(false)} />}
      <ListBody list={list} />
    </Panel>
  );
}

function useList(id: number): GroceryList | undefined {
  const { lists } = useData();
  return lists.find((l) => l.id === id);
}

function useListRequest() {
  const { setList } = useData();
  return async (request: ListRequest) => {
    try {
      const list = await request();
      if (list) {
        setList(list);
      }
    } catch (err) {
      toast((err as Error).message);
    }
  };
}

function ListIndex({ openId }: { openId?: number }) {
  const { lists } = useData();
  return (
    <div className="list">
      {lists.map((l) => (
        <Link
          key={l.id}
          className={`li${l.id === openId ? " on" : ""}`}
          href={`/lists/${l.id}`}
          aria-current={l.id === openId ? "page" : undefined}
        >
          <span className="grow">
            <span className="name">{l.name}</span>
            <br />
            <span className="small muted">{listSummary(l)}</span>
          </span>
          <span className="muted">{l.items.length}</span>
        </Link>
      ))}
      {lists.length === 0 && <p className="empty">No lists yet.</p>}
    </div>
  );
}

function listSummary(list: GroceryList): string {
  const status =
    list.kind === "essentials"
      ? "Always kept on hand"
      : `${list.items.filter((i) => !i.done).length} to buy`;
  return list.isDefault ? `${status}, default list` : status;
}

function AddListForm() {
  const { setList } = useData();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const list = await api.post<GroceryList>("/api/lists", { name });
      setList(list);
      setName("");
      navigate(`/lists/${list.id}`);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <form className="row nowrap" onSubmit={add}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New list name"
        aria-label="New list name"
      />
      <button className="btn" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

function EditToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button className="btn small ghost" onClick={onToggle}>
      {open ? "Close" : "Edit"}
    </button>
  );
}

function ListBody({ list }: { list: GroceryList }) {
  const essentials = list.kind === "essentials";
  return (
    <>
      {essentials && (
        <p className="muted">
          These are never done. Each Saturday, the stock check asks about each one so you can mark
          the low ones.
        </p>
      )}
      <AddItemForm list={list} />
      <ItemList list={list} />
      <ClearDoneButton list={list} />
    </>
  );
}

function ListSettings({ list, onRenamed }: { list: GroceryList; onRenamed: () => void }) {
  const { reload } = useData();
  const [, navigate] = useLocation();
  const request = useListRequest();
  const [title, setTitle] = useState(list.name);
  const fixed = list.kind === "essentials";

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    void request(() => api.patch<GroceryList>(`/api/lists/${list.id}`, { name: title }));
    onRenamed();
  };

  const makeDefault = async () => {
    await request(() => api.patch<GroceryList>(`/api/lists/${list.id}`, { isDefault: true }));
    await reload(["lists"]);
  };

  const remove = async () => {
    if (!confirm(`Delete ${list.name}?`)) {
      return;
    }
    await api.del(`/api/lists/${list.id}`);
    await reload(["lists"]);
    navigate("/lists");
  };

  return (
    <section className="storebox">
      <form className="row nowrap" onSubmit={rename}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="List name"
        />
        <button className="btn">Rename</button>
      </form>
      {!fixed && !list.isDefault && (
        <button className="btn ghost" onClick={makeDefault}>
          Make this the default list
        </button>
      )}
      {!fixed && (
        <button className="btn danger" onClick={remove}>
          Delete list
        </button>
      )}
    </section>
  );
}

function AddItemForm({ list }: { list: GroceryList }) {
  const { groceries } = useData();
  const request = useListRequest();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { groceryName: name, amount: amount.trim() ? Number(amount) : null };
    void request(() => api.post<GroceryList>(`/api/lists/${list.id}/items`, body));
    setName("");
    setAmount("");
  };

  return (
    <>
      <datalist id="list-grocery-names">
        {groceries.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
      <form className="row nowrap" onSubmit={add}>
        <input
          type="text"
          list="list-grocery-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a grocery"
          aria-label="Grocery"
        />
        {list.kind !== "essentials" && (
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
    </>
  );
}

function ItemList({ list }: { list: GroceryList }) {
  const request = useListRequest();
  const tick = (item: ListItem) => () =>
    void request(() => api.patch<GroceryList>(`/api/list-items/${item.id}`, { done: !item.done }));
  return (
    <div className="list">
      {list.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onTick={list.kind === "essentials" ? undefined : tick(item)}
        />
      ))}
      {list.items.length === 0 && <p className="empty">Nothing on this list.</p>}
    </div>
  );
}

function ItemRow({ item, onTick }: { item: ListItem; onTick?: () => void }) {
  const request = useListRequest();
  return (
    <div className={`li${item.done ? " have" : ""}`}>
      {onTick && (
        <button
          className={`tick${item.done ? " on" : ""}`}
          aria-pressed={item.done}
          aria-label={`${item.groceryName} done`}
          onClick={onTick}
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
        onClick={() => void request(() => api.del<GroceryList>(`/api/list-items/${item.id}`))}
      >
        Remove
      </button>
    </div>
  );
}

function ClearDoneButton({ list }: { list: GroceryList }) {
  const request = useListRequest();
  const done = list.items.filter((i) => i.done).length;
  if (done === 0) {
    return null;
  }
  return (
    <button
      className="btn ghost"
      onClick={() => void request(() => api.post<GroceryList>(`/api/lists/${list.id}/clear-done`))}
    >
      Clear {done} done item{done === 1 ? "" : "s"}
    </button>
  );
}
