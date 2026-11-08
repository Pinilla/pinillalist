import { readNumber } from "../../src/shared/amounts.ts";

export interface AnyListIngredient {
  name: string;
  quantity?: string | undefined;
  note?: string | undefined;
}

export interface ParsedIngredient {
  groceryName: string;
  cookingAmount: string;
  preparation: string;
}

const PREP_WORDS = new Set([
  "minced", "chopped", "diced", "sliced", "grated", "shredded", "crushed", "melted",
  "softened", "cubed", "julienned", "peeled", "cooked", "mashed", "halved", "quartered",
  "finely", "roughly", "thinly", "freshly", "raw",
]);

const SIZE_WORDS = new Set(["large", "medium", "small", "extra-large", "jumbo"]);

const MEASURE = /^(?:[a-z]+\.?)(?=\s|$)/i;

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Removes wrapping parentheses, commas and spaces: " ((to taste))" -> "to taste". */
function unwrap(text: string): string {
  let t = squash(text);
  for (;;) {
    const next = t.replace(/^[\s,]+|[\s,]+$/g, "").replace(/^\((.*)\)$/s, "$1").trim();
    if (next === t) return t;
    t = next;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Peels "30g 6 cloves" off the front of a name that has its amount inside it. */
function peelAmount(name: string): { amount: string; rest: string } {
  const amounts: string[] = [];
  let rest = name;
  for (;;) {
    const num = readNumber(rest);
    if (!num) break;
    const consumed = rest.trim().slice(0, rest.trim().length - num.rest.length).trim();
    let after = num.rest;
    let unit = "";
    const m = MEASURE.exec(after);
    // Count the next word as a unit only when another word still follows it.
    if (m && after.slice(m[0].length).trim() && isUnitWord(m[0])) {
      unit = m[0];
      after = after.slice(m[0].length).trim();
    }
    amounts.push(squash(`${consumed}${unit ? " " + unit : ""}`).replace(/^(\S+) (g|kg|ml|oz)$/, "$1 $2"));
    rest = after;
  }
  return { amount: amounts.join(" "), rest };
}

const UNIT_WORDS = /^(g|kg|mg|ml|l|oz|lbs?|pounds?|ounces?|grams?|cups?|c|tbsp|tsp|t|tablespoons?|teaspoons?|cloves?|cans?|slices?|strips?|pinch|dash)\.?$/i;
function isUnitWord(word: string): boolean {
  return UNIT_WORDS.test(word);
}

/**
 * Splits an AnyList ingredient into a grocery name, a cooking amount and a
 * preparation. Preparations come from the note, from parentheses or a comma in
 * the name, and from words like "minced" in front of the name.
 */
export function parseIngredient(input: AnyListIngredient): ParsedIngredient {
  const preps: string[] = [];
  const quantity = unwrap(input.quantity ?? "");
  let cookingAmount = quantity;
  let name = squash(input.name).replace(/^[∙•·.\s]+/, "");

  // AnyList sometimes splits "2 and 1/2 cups flour" into a quantity of "2" and a name of "and 1/2 cups flour".
  const andMatch = /^and\s+(?=[\d½⅓⅔¼¾⅛])/i.exec(name);
  if (andMatch) {
    const peeled = peelAmount(name.slice(andMatch[0].length));
    if (peeled.amount) {
      cookingAmount = squash(`${quantity} and ${peeled.amount}`);
      name = peeled.rest;
    }
  } else {
    // Some recipes put the amount inside the name: "7g salt", "30g 6 cloves minced garlic".
    const peeled = peelAmount(name);
    if (peeled.amount && peeled.rest) {
      const amount = peeled.amount.replace(/(\d)\s+(g|kg|ml)\b/g, "$1$2");
      cookingAmount = quantity ? `${amount} (${quantity})` : amount;
      name = peeled.rest;
    }
  }

  // "1 packet of chili seasoning" leaves "of" at the front once the amount is gone.
  name = name.replace(/^(of|\/)\s+/i, "");

  // A size belongs with the amount ("1 large"), not the grocery, so "Large egg" is Egg.
  const sized = name.split(" ");
  while (sized.length > 1 && SIZE_WORDS.has(sized[0]!.toLowerCase())) {
    const size = sized.shift()!.toLowerCase();
    cookingAmount = cookingAmount ? `${cookingAmount} ${size}` : size;
  }
  name = sized.join(" ");

  // Leading preparation words: "minced garlic" -> garlic, minced.
  const words = name.split(" ");
  const leading: string[] = [];
  while (words.length > 1 && PREP_WORDS.has(words[0]!.toLowerCase())) leading.push(words.shift()!.toLowerCase());
  if (leading.length) preps.push(leading.join(" "));
  name = words.join(" ");

  // Parenthesized parts of the name.
  const parens: string[] = [];
  name = name.replace(/\(([^)]*)\)?/g, (_, inner: string) => {
    parens.push(unwrap(inner));
    return " ";
  });

  // Anything after the first comma.
  const comma = name.indexOf(",");
  if (comma !== -1) {
    const after = unwrap(name.slice(comma + 1));
    if (after) preps.push(after);
    name = name.slice(0, comma);
  }
  preps.push(...parens.filter(Boolean));

  name = name.replace(/[()]/g, " ");

  const note = unwrap(input.note ?? "");
  if (note) preps.push(note);

  return {
    groceryName: capitalize(squash(name)),
    cookingAmount,
    preparation: preps.join(", "),
  };
}

const COUNT_UNITS: Record<string, string> = {
  "": "", large: "", medium: "", small: "", whole: "",
  lb: "lb", "lb.": "lb", lbs: "lb", "lbs.": "lb", pound: "lb", pounds: "lb",
  can: "can", cans: "can",
  pack: "pack", packs: "pack", package: "pack", packages: "pack",
  packet: "packet", packets: "packet",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  jar: "jar", jars: "jar",
  bottle: "bottle", bottles: "bottle",
  bunch: "bunch", bunches: "bunch",
  head: "head", heads: "head",
};

/**
 * Reads a buying amount from a cooking amount that already counts the grocery,
 * such as "2" (onions), "1 large", "1 lb" or "1 can". Returns null for cups,
 * spoons, grams, pinches and ranges, which the household fills in by hand.
 */
export function countedAmount(cookingAmount: string): { amount: number; unit: string } | null {
  const num = readNumber(cookingAmount);
  if (!num || num.value <= 0) return null;
  const rest = squash(num.rest.replace(/\([^)]*\)/g, " ")).toLowerCase();
  if (/^[-–]/.test(rest)) return null;
  const unit = COUNT_UNITS[rest];
  if (unit === undefined) return null;
  return { amount: num.value, unit };
}
