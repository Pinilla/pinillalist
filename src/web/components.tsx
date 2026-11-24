import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatNumber } from "../shared/amounts.ts";
import { toggleCollection } from "../shared/filters.ts";
import { STORE_NAMES, type Collection, type Product } from "../shared/types.ts";
import { photoUrl } from "./api.ts";

export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  className = "",
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  className?: string;
  label: string;
}) {
  return (
    <span className={`stepper ${className}`.trim()} role="group" aria-label={label}>
      <button type="button" aria-label="Less" disabled={value - step < min} onClick={() => onChange(round(Math.max(min, value - step)))}>
        −
      </button>
      <output aria-live="polite">{formatNumber(value)}</output>
      <button type="button" aria-label="More" onClick={() => onChange(round(value + step))}>
        +
      </button>
    </span>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function CollectionChips({
  collections,
  chosen,
  onChange,
}: {
  collections: Collection[];
  chosen: number[];
  onChange: (chosen: number[]) => void;
}) {
  return (
    <div className="chips" role="group" aria-label="Collections">
      <button className={`chip${chosen.length === 0 ? " on" : ""}`} aria-pressed={chosen.length === 0} onClick={() => onChange([])}>
        All
      </button>
      {collections.map((c) => {
        const on = chosen.includes(c.id);
        return (
          <button key={c.id} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(toggleCollection(chosen, c.id))}>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

export function StoreBadge({ product }: { product: Product | null }) {
  if (!product) return <span className="store none">No product</span>;
  return <span className={`store ${product.store}`}>{STORE_NAMES[product.store]}</span>;
}

export function productLabel(product: Product): string {
  return [product.name || `${STORE_NAMES[product.store]} ${product.storeId}`, product.size].filter(Boolean).join(", ");
}

export function productUrl(product: Product): string {
  return product.store === "walmart"
    ? `https://www.walmart.com/ip/${product.storeId}`
    : `https://www.amazon.com/dp/${product.storeId}`;
}

export function Thumb({ photo, name, className = "thumb" }: { photo: string | null; name: string; className?: string }) {
  const src = photoUrl(photo);
  if (src) return <img className={className} src={src} alt="" loading="lazy" />;
  return (
    <span className={className === "thumb" ? "thumb" : "ph"} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

let showToast: (text: string) => void = () => {};

export function toast(text: string) {
  showToast(text);
}

export function ToastHost() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    showToast = (t) => {
      setText(t);
      clearTimeout(timer);
      timer = setTimeout(() => setText(null), 3500);
    };
    return () => clearTimeout(timer);
  }, []);
  return text ? (
    <div className="toast" role="status">
      {text}
    </div>
  ) : null;
}

const DESKTOP = "(min-width: 900px)";

export function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP).matches,
  );
}

export function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel stack">
      <div className="row between nowrap">
        <h2 className="grow">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Page({
  title,
  back,
  actions,
  children,
  width,
}: {
  title: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "medium";
}) {
  return (
    <main className={`wrap stack${width ? ` ${width}` : ""}`}>
      {back}
      <div className="row between nowrap">
        <h1 className="grow">{title}</h1>
        {actions}
      </div>
      {children}
    </main>
  );
}

export function minutes(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`;
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
