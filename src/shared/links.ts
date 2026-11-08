import type { Store } from "./types.ts";

export type ParsedLink =
  | { ok: true; store: Store; storeId: string }
  | { ok: false; error: string };

export const WALMART_ID = /^\d{5,15}$/;
export const ASIN = /^[A-Z0-9]{10}$/;

/**
 * Reads the store and product ID from a pasted product link.
 * Walmart: the number after /ip/ (walmart.com/ip/<slug>/<id> or /ip/<id>).
 * Amazon: the 10-character code after /dp/ or /gp/product/.
 */
export function parseProductLink(input: string): ParsedLink {
  const text = input.trim();
  const found = /https?:\/\/\S+/i.exec(text);
  const raw = found ? found[0] : text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "walmart.com" || host.endsWith(".walmart.com")) {
    const ip = parts.indexOf("ip");
    if (ip === -1) return { ok: false, error: "A Walmart product link has /ip/ in it." };
    const id = parts.slice(ip + 1).reverse().find((p) => WALMART_ID.test(p));
    if (!id) return { ok: false, error: "No Walmart item number found after /ip/." };
    return { ok: true, store: "walmart", storeId: id };
  }

  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
    for (const [i, p] of parts.entries()) {
      const next = parts[i + 1]?.toUpperCase();
      const isMarker = p === "dp" || (p === "product" && parts[i - 1] === "gp") || (p === "d" && parts[i - 1] === "aw");
      if (isMarker && next && ASIN.test(next)) return { ok: true, store: "amazon", storeId: next };
    }
    return { ok: false, error: "No Amazon product code found after /dp/ or /gp/product/." };
  }

  if (host === "amzn.to" || host === "a.co") {
    return { ok: false, error: "Short Amazon links can't be read. Open it and copy the full link from the browser." };
  }

  return { ok: false, error: "Only Walmart and Amazon product links work." };
}
