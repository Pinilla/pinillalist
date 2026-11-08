import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { setPassword } from "../../src/server/auth.ts";
import { migrateDb, openDb } from "../../src/server/db/index.ts";

export const PASSWORD = "correct horse";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Starts the app on a fresh database file and returns a client that's already logged in. */
export async function setup(opts: { password?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pinillalist-test-"));
  dirs.push(dir);
  const db = openDb(path.join(dir, "test.db"));
  migrateDb(db);
  if (opts.password !== false) setPassword(db, PASSWORD);
  const app = createApp({ db, photosDir: path.join(dir, "photos") });

  async function login(password = PASSWORD) {
    return app.request("/login", {
      method: "POST",
      body: new URLSearchParams({ password }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  }

  let cookie = "";
  if (opts.password !== false) {
    const res = await login();
    cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  }

  async function call<T = any>(method: string, url: string, json?: unknown): Promise<{ status: number; body: T }> {
    const res = await app.request(url, {
      method,
      headers: { cookie, ...(json === undefined ? {} : { "content-type": "application/json" }) },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return { app, db, dir, login, cookie, call };
}

export function recipeBody(name: string, ingredients: unknown[], extra: Record<string, unknown> = {}) {
  return { name, steps: [], collectionIds: [], ingredients, ...extra };
}
