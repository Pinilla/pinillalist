import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatNumber } from "../shared/amounts.ts";
import { STORE_NAMES, type Product } from "../shared/types.ts";
import { photoUrl } from "./api.ts";

export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  large = false,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  large?: boolean;
  label: string;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <span className={`stepper${large ? " large" : ""}`} role="group" aria-label={label}>
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

/** Shows a short message above the tab bar. */
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

/** True when the window is wide enough for the sidebar layout. Matches the breakpoint in styles.css. */
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

/**
 * A screen with a title. `embedded` renders it as a panel inside another screen, which the
 * desktop layout uses to show a grocery or a list next to its index.
 */
export function Page({
  title,
  back,
  actions,
  children,
  width,
  embedded = false,
}: {
  title: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "medium";
  embedded?: boolean;
}) {
  if (embedded) {
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
