function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const NOT_PLURAL = new Set(["molasses", "brussels", "swiss", "grits"]);

function singular(word: string): string {
  if (NOT_PLURAL.has(word) || word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** The name used to decide that two ingredients are the same grocery. */
export function groceryKey(name: string): string {
  return squash(name.toLowerCase().replace(/[^\p{L}\p{N}\s&]/gu, " "))
    .split(" ")
    .map(singular)
    .join(" ");
}

const JOINING_WORDS = new Set(["and", "or", "of", "&", "with"]);

/**
 * True when one name is the other with one or two words added in front, like
 * "onion" and "yellow onion". Combined groceries such as "salt and pepper" never match.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const ka = groceryKey(a).split(" ");
  const kb = groceryKey(b).split(" ");
  if (ka.join(" ") === kb.join(" ")) return false;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (long.length - short.length > 2) return false;
  if ([...short, ...long].some((w) => JOINING_WORDS.has(w))) return false;
  return long.slice(long.length - short.length).join(" ") === short.join(" ");
}
