// One-time import of the household's AnyList export into an empty database.
// Usage: npm run import-anylist -- [path to export folder, default ~/anylist-export]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/server/config.ts";
import { migrateDb, openDb } from "../src/server/db/index.ts";
import { importAnyList } from "./anylist/import.ts";

const exportDir = path.resolve(process.argv[2] ?? path.join(homedir(), "anylist-export"));
const config = loadConfig();
const db = openDb(config.dbFile);
migrateDb(db);

const data = JSON.parse(readFileSync(path.join(exportDir, "user-data.json"), "utf8"));
try {
  const r = importAnyList(db, data, { photosFrom: path.join(exportDir, "photos"), photosTo: config.photosDir });
  console.log(`Imported into ${config.dbFile}:
  ${r.recipes} recipes in ${r.collections} collections, ${r.photos} with photos
  ${r.ingredients} ingredients, ${r.withBuyingAmount} with a buying amount filled in, ${r.ingredients - r.withBuyingAmount} left for the household
  ${r.groceries} groceries in the catalog
  ${r.essentials} items on the Essentials list
  ${r.suggestions} possible duplicates to review under Catalog
  Skipped lists: ${r.skippedLists.join(", ") || "none"}`);
  if (r.missingPhotos.length) console.log(`  Photos missing for: ${r.missingPhotos.join(", ")}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
