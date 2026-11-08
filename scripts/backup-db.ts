// Copies the live database to <data>/backups/ with SQLite's online backup, which is safe while the app runs.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "../src/server/config.ts";

const KEEP = 20;
const config = loadConfig();
const dir = path.join(config.dataDir, "backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(dir, `pinillalist-${stamp}.db`);
const db = new Database(config.dbFile, { fileMustExist: true });
await db.backup(target);
db.close();
const old = readdirSync(dir).filter((f) => f.endsWith(".db")).sort().slice(0, -KEEP);
for (const f of old) rmSync(path.join(dir, f));
console.log(`Backed up to ${target}`);
