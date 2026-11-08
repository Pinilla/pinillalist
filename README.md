# pinillalist

A grocery list and recipe app for one household, built around the Saturday weekly order. It runs at https://list.pinillaweb.org on server1. The spec is [`docs/spec/v1.md`](docs/spec/v1.md), and domain terms are in [`GLOSSARY.md`](GLOSSARY.md).

## Layout

| Path | Contents |
|---|---|
| `src/shared/` | Logic the server and the phone both use: merging ingredients, reading product links, building cart links, the weekly order state |
| `src/server/` | Hono server: login, JSON API under `/api`, photos, and the built UI |
| `src/server/db/schema.ts` | Drizzle schema. Migrations are in `drizzle/` |
| `src/web/` | React app built with Vite |
| `scripts/` | Migrate, set the password, back up the database, and the one-time AnyList import |
| `tests/api/` | API tests, each on its own throwaway SQLite file |
| `tests/e2e/` | Playwright walks through the wizard on a seeded database. They read the cart links and never open a store |
| `deploy/` | systemd unit, nginx block and deploy script for server1 |

## Development

Needs Node 24. On server1 it's in `/opt/node`.

```sh
npm install
npm run set-password          # stores the household password in data/pinillalist.db
npm run dev                   # API on :3100, Vite on :5173 with /api proxied
```

Data lives in `data/` unless `PINILLALIST_DATA` points elsewhere.

```sh
npm run typecheck
npm test                      # Vitest: shared logic, AnyList parsing, API
npm run test:e2e              # Playwright in headless Chromium
```

After changing `src/server/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.

## AnyList import

The import runs once, on an empty database, from the export in `~/anylist-export/`:

```sh
PINILLALIST_DATA=/var/lib/pinillalist npm run import-anylist -- ~/anylist-export
```

It brings over recipes, collections, photos and the Weekly Essentials list. It skips Quick Things, Store and the empty My Grocery List. Near-duplicate groceries such as "Onions" and "Yellow onion" show up under Catalog, Possible duplicates, for the household to merge or keep apart.

## Deploying on server1

The owner merges pull requests, and deploys happen by hand:

```sh
~/pinillalist/deploy/deploy.sh
```

The script pulls `main` into `/opt/pinillalist`, runs the tests, builds, backs up the database to `/var/lib/pinillalist/backups/`, applies migrations and restarts `pinillalist.service`. The first install also needs the `pinillalist` system user, the unit file and the nginx block from `deploy/`. See `~/homelab/services/pinillalist.md`.
