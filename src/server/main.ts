import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { migrateDb, openDb } from "./db/index.ts";

const config = loadConfig();
mkdirSync(config.photosDir, { recursive: true });
const db = openDb(config.dbFile);
// Deploys apply migrations before restarting, so this only matters in development.
migrateDb(db);

const app = createApp({ db, photosDir: config.photosDir, distDir: config.distDir, secureCookie: config.secureCookie });

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`pinillalist listening on http://${info.address}:${info.port}`);
});
