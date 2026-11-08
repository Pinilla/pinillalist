import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

export const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export function openDb(file: string) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof openDb>;

export function migrateDb(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS });
}
