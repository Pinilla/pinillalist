// Applies database migrations. The deploy script runs this before restarting the service.
import { mkdirSync } from "node:fs";
import { loadConfig } from "../src/server/config.ts";
import { migrateDb, openDb } from "../src/server/db/index.ts";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
migrateDb(openDb(config.dbFile));
console.log(`Migrated ${config.dbFile}`);
