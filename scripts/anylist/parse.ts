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

export function parseIngredient(input: AnyListIngredient): ParsedIngredient {
  const quantity = unwrap(input.quantity ?? "");
  const amount = splitAmount(squash(input.name).replace(/^[∙•·.\s]+/, ""), quantity);
  const sized = takeSizeWords(amount.name.replace(/^(of|\/)\s+/i, ""), amount.cookingAmount);
  const leading = takeLeadingPreparation(sized.name);
  const parens = takeParentheses(leading.name);
  const comma = takeAfterComma(parens.name);
  const note = unwrap(input.note ?? "");
  const preps = [leading.preparation, comma.preparation, ...parens.notes, note].filter(Boolean);
  return {
    groceryName: capitalize(squash(comma.name.replace(/[()]/g, " "))),
    cookingAmount: sized.cookingAmount,
    preparation: preps.join(", "),
  };
}

function splitAmount(name: string, quantity: string): { name: string; cookingAmount: string } {
  const andMatch = /^and\s+(?=[\d½⅓⅔¼¾⅛])/i.exec(name);
  if (andMatch) {
    const peeled = peelAmount(name.slice(andMatch[0].length));
    return peeled.amount ? { name: peeled.rest, cookingAmount: squash(`${quantity} and ${peeled.amount}`) } : { name, cookingAmount: quantity };
  }
  const peeled = peelAmount(name);
  if (!peeled.amount || !peeled.rest) return { name, cookingAmount: quantity };
  const amount = peeled.amount.replace(/(\d)\s+(g|kg|ml)\b/g, "$1$2");
  return { name: peeled.rest, cookingAmount: quantity ? `${amount} (${quantity})` : amount };
}

function takeSizeWords(name: string, cookingAmount: string): { name: string; cookingAmount: string } {
  const words = name.split(" ");
  let amount = cookingAmount;
  while (words.length > 1 && SIZE_WORDS.has(words[0]!.toLowerCase())) {
    const size = words.shift()!.toLowerCase();
    amount = amount ? `${amount} ${size}` : size;
  }
  return { name: words.join(" "), cookingAmount: amount };
}

function takeLeadingPreparation(name: string): { name: string; preparation: string } {
  const words = name.split(" ");
  const leading: string[] = [];
  while (words.length > 1 && PREP_WORDS.has(words[0]!.toLowerCase())) leading.push(words.shift()!.toLowerCase());
  return { name: words.join(" "), preparation: leading.join(" ") };
}

function takeParentheses(name: string): { name: string; notes: string[] } {
  const notes: string[] = [];
  const rest = name.replace(/\(([^)]*)\)?/g, (_, inner: string) => {
    notes.push(unwrap(inner));
    return " ";
  });
  return { name: rest, notes };
}

function takeAfterComma(name: string): { name: string; preparation: string } {
  const comma = name.indexOf(",");
  if (comma === -1) return { name, preparation: "" };
  return { name: name.slice(0, comma), preparation: unwrap(name.slice(comma + 1)) };
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

export function countedAmount(cookingAmount: string): { amount: number; unit: string } | null {
  const num = readNumber(cookingAmount);
  if (!num || num.value <= 0) return null;
  const rest = squash(num.rest.replace(/\([^)]*\)/g, " ")).toLowerCase();
  if (/^[-–]/.test(rest)) return null;
  const unit = COUNT_UNITS[rest];
  if (unit === undefined) return null;
  return { amount: num.value, unit };
}
