/** Where the household keeps things, in the order the stock check walks the house. */
export const LOCATIONS = [
  { key: "master_closet", label: "Master closet" },
  { key: "shower", label: "Shower" },
  { key: "master_bathroom", label: "Master bathroom" },
  { key: "office", label: "Office" },
  { key: "pantry", label: "Pantry" },
  { key: "counter", label: "Counter" },
  { key: "baking_cabinet", label: "Baking cabinet" },
  { key: "sink_cabinet", label: "Sink cabinet" },
  { key: "fridge", label: "Fridge" },
  { key: "freezer", label: "Freezer" },
  { key: "laundry_room", label: "Laundry room" },
] as const;

export type LocationKey = (typeof LOCATIONS)[number]["key"];

/** Groceries without a location are checked last, under this name. */
export const NO_LOCATION_LABEL = "Other";

export function isLocation(value: unknown): value is LocationKey {
  return LOCATIONS.some((l) => l.key === value);
}

export function locationLabel(key: LocationKey | null): string {
  return LOCATIONS.find((l) => l.key === key)?.label ?? NO_LOCATION_LABEL;
}

/** Position in the walk. Groceries without a location come after every location. */
export function locationRank(key: LocationKey | null): number {
  const i = LOCATIONS.findIndex((l) => l.key === key);
  return i === -1 ? LOCATIONS.length : i;
}
