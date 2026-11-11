const VULGAR: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
  "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5, "⅙": 1 / 6,
  "⅚": 5 / 6, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
};

const VULGAR_CHARS = Object.keys(VULGAR).join("");

/** Matches a leading number: "2", "1.5", ".125", "1/2", "1 1/2", "½", "1½", "1 ½". */
export const NUMBER_PATTERN = new RegExp(
  `^(?:(\\d+)\\s*([${VULGAR_CHARS}])|(\\d+)\\s+(\\d+)\\/(\\d+)|(\\d+)\\/(\\d+)|([${VULGAR_CHARS}])|(\\d*\\.\\d+|\\d+))`,
);

/** Reads a number at the start of the text. Returns the value and the rest of the text. */
export function readNumber(text: string): { value: number; rest: string } | null {
  const m = NUMBER_PATTERN.exec(text.trim());
  if (!m) return null;
  let value: number;
  if (m[1] !== undefined) value = Number(m[1]) + VULGAR[m[2]!]!;
  else if (m[3] !== undefined) value = Number(m[3]) + Number(m[4]) / Number(m[5]);
  else if (m[6] !== undefined) value = Number(m[6]) / Number(m[7]);
  else if (m[8] !== undefined) value = VULGAR[m[8]]!;
  else value = Number(m[9]);
  if (!Number.isFinite(value)) return null;
  return { value, rest: text.trim().slice(m[0].length).trim() };
}

/** Formats an amount without float noise: 2, 1.5, 0.33. */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}
