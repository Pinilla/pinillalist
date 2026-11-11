import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { parseProductLink } from "../shared/links.ts";
import { LOCATIONS, isLocation, type LocationKey } from "../shared/locations.ts";
import type { Product } from "../shared/types.ts";
import { COOKIE, COOKIE_MAX_AGE, LoginLimiter, cookieSecret, sessionValue, verifyPassword } from "./auth.ts";
import type { Db } from "./db/index.ts";
import { loginPage } from "./login-page.ts";
import * as repo from "./repo.ts";

export interface AppOptions {
  db: Db;
  photosDir: string;
  /** The built UI. Leave out in tests and in development, where Vite serves it. */
  distDir?: string;
  /** Mark the cookie Secure. True behind nginx's HTTPS. */
  secureCookie?: boolean;
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function bad(message: string): never {
  throw new HTTPException(400, { message });
}

function id(c: Context, name = "id"): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) bad(`Bad ${name}`);
  return n;
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  bad("Send a JSON object.");
}

function str(v: unknown, field: string, fallback?: string): string {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string") bad(`${field} must be text.`);
  return v;
}

function optStr(v: unknown, field: string): string | undefined {
  return v === undefined ? undefined : str(v, field);
}

function num(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) bad(`${field} must be a number of 0 or more.`);
  return v;
}

function bool(v: unknown, field: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") bad(`${field} must be true or false.`);
  return v;
}

function recipeInput(b: Record<string, unknown>): repo.RecipeInput {
  const steps = b.steps ?? [];
  const ingredients = b.ingredients ?? [];
  const collectionIds = b.collectionIds ?? [];
  if (!Array.isArray(steps) || !Array.isArray(ingredients) || !Array.isArray(collectionIds)) {
    bad("steps, ingredients and collectionIds must be lists.");
  }
  return {
    name: str(b.name, "name"),
    servings: str(b.servings, "servings", ""),
    prepTime: num(b.prepTime, "prepTime"),
    cookTime: num(b.cookTime, "cookTime"),
    steps: steps.map((s, i) => str(s, `steps[${i}]`)),
    note: str(b.note, "note", ""),
    sourceName: str(b.sourceName, "sourceName", ""),
    sourceUrl: str(b.sourceUrl, "sourceUrl", ""),
    rating: num(b.rating, "rating"),
    collectionIds: collectionIds.map((n) => {
      if (!Number.isInteger(n)) bad("collectionIds must be numbers.");
      return n as number;
    }),
    ingredients: ingredients.map((raw, i): repo.IngredientInput => {
      if (!raw || typeof raw !== "object") bad(`ingredients[${i}] must be an object.`);
      const r = raw as Record<string, unknown>;
      if (r.kind === "heading") return { kind: "heading", text: str(r.text, "heading text") };
      return {
        kind: "ingredient",
        groceryName: str(r.groceryName, "groceryName"),
        cookingAmount: str(r.cookingAmount, "cookingAmount", ""),
        preparation: str(r.preparation, "preparation", ""),
      };
    }),
  };
}

function clientAddress(c: Context): string {
  // The server listens only on 127.0.0.1 behind nginx, which sets X-Real-IP.
  return c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export function createApp(options: AppOptions) {
  const { db, photosDir, distDir } = options;
  const secret = cookieSecret(db);
  const limiter = new LoginLimiter();
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof repo.NotFound) return c.json({ error: err.message }, 404);
    if (err instanceof repo.Conflict) return c.json({ error: err.message }, 409);
    console.error(err);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  // Login. These are the only routes that work without the cookie, along with the
  // web app manifest and icons, which phones fetch without cookies.
  app.get("/login", (c) => c.html(loginPage({ needsSetup: !sessionValue(db) })));

  app.post("/login", async (c) => {
    const address = clientAddress(c);
    if (limiter.blocked(address)) {
      return c.html(loginPage({ error: "Too many wrong tries. Wait 15 minutes and try again." }), 429);
    }
    const form = await c.req.parseBody();
    const password = typeof form.password === "string" ? form.password : "";
    const stored = repo.getSetting(db, "password_hash");
    const value = sessionValue(db);
    if (!stored || !value) return c.html(loginPage({ needsSetup: true }), 503);
    if (!verifyPassword(password, stored)) {
      limiter.fail(address);
      return c.html(loginPage({ error: "That's not the household password." }), 401);
    }
    limiter.reset(address);
    await setSignedCookie(c, COOKIE, value, secret, {
      path: "/",
      httpOnly: true,
      secure: options.secureCookie ?? false,
      sameSite: "Lax",
      maxAge: COOKIE_MAX_AGE,
    });
    return c.redirect("/");
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/login");
  });

  const PUBLIC = new Set(["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]);

  app.use("*", async (c, next) => {
    if (PUBLIC.has(c.req.path)) return next();
    const expected = sessionValue(db);
    const value = await getSignedCookie(c, secret, COOKIE);
    if (expected && value === expected) return next();
    if (c.req.path.startsWith("/api/")) return c.json({ error: "Log in first." }, 401);
    return c.redirect("/login");
  });

  const api = new Hono();

  // Catalog

  api.get("/groceries", (c) => c.json(repo.listGroceries(db)));

  api.get("/groceries/usage", (c) => c.json(repo.groceryUsage(db)));

  api.post("/groceries", async (c) => {
    const b = await body(c);
    const { grocery, created } = repo.findOrCreateGrocery(db, str(b.name, "name"), str(b.unit, "unit", ""));
    return c.json(grocery, created ? 201 : 200);
  });

  api.patch("/groceries/:id", async (c) => {
    const b = await body(c);
    let location: LocationKey | null | undefined;
    if (b.location === null || b.location === "") location = null;
    else if (b.location !== undefined) {
      if (!isLocation(b.location)) bad(`location must be one of: ${LOCATIONS.map((l) => l.key).join(", ")}`);
      location = b.location;
    }
    return c.json(repo.updateGrocery(db, id(c), { name: optStr(b.name, "name"), unit: optStr(b.unit, "unit"), location }));
  });

  api.delete("/groceries/:id", (c) => {
    repo.deleteGrocery(db, id(c));
    return c.body(null, 204);
  });

  api.put("/groceries/:id/product", async (c) => {
    const b = await body(c);
    const link = parseProductLink(str(b.link, "link"));
    if (!link.ok) bad(link.error);
    const soldBy = b.soldBy === undefined ? "each" : b.soldBy;
    if (soldBy !== "each" && soldBy !== "pound") bad("soldBy must be each or pound.");
    if (soldBy === "pound" && link.store !== "walmart") bad("Only Walmart deli products are sold by the pound.");
    const product: Product = {
      store: link.store,
      storeId: link.storeId,
      name: str(b.name, "name", "").trim(),
      size: str(b.size, "size", "").trim(),
      imageUrl: str(b.imageUrl, "imageUrl", "").trim(),
      soldBy,
    };
    return c.json(repo.setProduct(db, id(c), product));
  });

  api.delete("/groceries/:id/product", (c) => c.json(repo.removeProduct(db, id(c))));

  api.post("/groceries/:id/merge", async (c) => {
    const b = await body(c);
    const into = b.intoId;
    if (!Number.isInteger(into)) bad("intoId must be a grocery id.");
    return c.json(repo.mergeGrocery(db, id(c), into as number));
  });

  api.get("/merge-suggestions", (c) => c.json(repo.listMergeSuggestions(db)));

  api.post("/merge-suggestions/:id/keep", (c) => {
    repo.keepApart(db, id(c));
    return c.body(null, 204);
  });

  // Recipes

  api.get("/collections", (c) => c.json(repo.listCollections(db)));

  api.post("/collections", async (c) => c.json(repo.createCollection(db, str((await body(c)).name, "name")), 201));

  api.get("/recipes", (c) => {
    const ids = c.req.query("ids");
    if (ids === undefined) return c.json(repo.listRecipes(db));
    const list = ids.split(",").filter(Boolean).map(Number);
    if (list.some((n) => !Number.isInteger(n))) bad("ids must be numbers.");
    return c.json(repo.getRecipes(db, list));
  });

  api.get("/recipes/:id", (c) => c.json(repo.getRecipe(db, id(c))));

  api.post("/recipes", async (c) => c.json(repo.createRecipe(db, recipeInput(await body(c))), 201));

  api.put("/recipes/:id", async (c) => c.json(repo.updateRecipe(db, id(c), recipeInput(await body(c)))));

  api.delete("/recipes/:id", async (c) => {
    const photo = repo.deleteRecipe(db, id(c));
    if (photo) await unlink(path.join(photosDir, photo)).catch(() => {});
    return c.body(null, 204);
  });

  api.put("/recipes/:id/photo", async (c) => {
    const recipeId = id(c);
    repo.getRecipe(db, recipeId);
    const form = await c.req.parseBody();
    const file = form.photo;
    if (!(file instanceof File)) bad("Send the picture as the photo field.");
    const ext = PHOTO_TYPES[file.type];
    if (!ext) bad("The photo must be a JPEG, PNG or WebP picture.");
    if (file.size > MAX_PHOTO_BYTES) bad("The photo must be under 10 MB.");
    const name = randomBytes(12).toString("hex") + ext;
    await mkdir(photosDir, { recursive: true });
    await writeFile(path.join(photosDir, name), Buffer.from(await file.arrayBuffer()));
    const old = repo.setRecipePhoto(db, recipeId, name);
    if (old) await unlink(path.join(photosDir, old)).catch(() => {});
    return c.json(repo.getRecipe(db, recipeId));
  });

  // Lists

  api.get("/lists", (c) => c.json(repo.listLists(db)));

  api.post("/lists", async (c) => c.json(repo.createList(db, str((await body(c)).name, "name")), 201));

  api.patch("/lists/:id", async (c) => {
    const b = await body(c);
    return c.json(repo.updateList(db, id(c), { name: optStr(b.name, "name"), isDefault: bool(b.isDefault, "isDefault") }));
  });

  api.delete("/lists/:id", (c) => {
    repo.deleteList(db, id(c));
    return c.body(null, 204);
  });

  api.post("/lists/:id/items", async (c) => {
    const b = await body(c);
    const groceryId = b.groceryId;
    if (groceryId !== undefined && !Number.isInteger(groceryId)) bad("groceryId must be a number.");
    if (groceryId === undefined && typeof b.groceryName !== "string") bad("Send a groceryId or a groceryName.");
    return c.json(
      repo.addListItem(db, id(c), {
        groceryId: groceryId as number | undefined,
        groceryName: optStr(b.groceryName, "groceryName"),
        amount: num(b.amount, "amount"),
        details: optStr(b.details, "details"),
      }),
      201,
    );
  });

  api.post("/lists/:id/clear-done", (c) => c.json(repo.clearDone(db, id(c))));

  api.patch("/list-items/:id", async (c) => {
    const b = await body(c);
    return c.json(
      repo.updateListItem(db, id(c), {
        done: bool(b.done, "done"),
        amount: b.amount === undefined ? undefined : num(b.amount, "amount"),
        details: optStr(b.details, "details"),
      }),
    );
  });

  api.delete("/list-items/:id", (c) => c.json(repo.deleteListItem(db, id(c))));

  api.all("*", (c) => c.json({ error: "No such API route." }, 404));

  app.route("/api", api);

  app.use("/photos/*", serveStatic({ root: photosDir, rewriteRequestPath: (p) => p.replace(/^\/photos/, "") }));
  app.get("/photos/*", (c) => c.notFound());

  if (distDir) {
    const index = path.join(distDir, "index.html");
    app.use("*", serveStatic({ root: distDir }));
    // Every other page is the single-page app.
    app.get("*", (c) => {
      if (!existsSync(index)) return c.text("The UI isn't built. Run npm run build.", 500);
      return c.html(readFileSync(index, "utf8"));
    });
  }

  return app;
}
