import { describe, expect, it } from "vitest";
import { parseProductLink } from "./links.ts";

describe("parseProductLink", () => {
  it.each([
    ["https://www.walmart.com/ip/Great-Value-Whole-Milk-1-Gallon/10450114", "10450114"],
    ["https://www.walmart.com/ip/10450114", "10450114"],
    ["https://walmart.com/ip/10450114?sid=abc-123", "10450114"],
    ["walmart.com/ip/Fresh-Yellow-Onions-3-lb-Bag/51259212?athbdg=L1600", "51259212"],
    ["Check this out https://www.walmart.com/ip/Onions/51259212?sid=x shared from the app", "51259212"],
  ])("reads the Walmart item ID from %s", (link, id) => {
    expect(parseProductLink(link)).toEqual({ ok: true, store: "walmart", storeId: id });
  });

  it.each([
    ["https://www.amazon.com/dp/B07XJ8C8F5", "B07XJ8C8F5"],
    ["https://www.amazon.com/Huggies-Little-Snugglers/dp/B07XJ8C8F5/ref=sr_1_3?keywords=x", "B07XJ8C8F5"],
    ["https://www.amazon.com/gp/product/B07XJ8C8F5?th=1", "B07XJ8C8F5"],
    ["https://www.amazon.com/gp/aw/d/B07XJ8C8F5", "B07XJ8C8F5"],
    ["https://smile.amazon.com/dp/b07xj8c8f5", "B07XJ8C8F5"],
  ])("reads the Amazon ASIN from %s", (link, asin) => {
    expect(parseProductLink(link)).toEqual({ ok: true, store: "amazon", storeId: asin });
  });

  it.each([
    "https://www.walmart.com/search?q=onions",
    "https://www.walmart.com/ip/onions",
    "https://www.amazon.com/s?k=diapers",
    "https://amzn.to/3abcdef",
    "https://www.target.com/p/onions/-/A-123",
    "",
  ])("rejects %s", (link) => {
    expect(parseProductLink(link).ok).toBe(false);
  });
});
