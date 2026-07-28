# Agency OS

Client-facing performance marketing dashboard + agency operating system.
Client #1: **Organik Truck**. Design doc: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) + Recharts
- **Postgres** — [Supabase](https://supabase.com) in production, embedded [PGlite](https://pglite.dev) for local dev (zero setup, persisted to `.pglite/`)
- Plain SQL migrations in `supabase/migrations/` — run identically on both

## Local dev

```bash
npm install
npm run seed   # loads data/*.csv (workbook export) into local PGlite
npm run dev    # http://localhost:3000 → /organik-truck
```

`data/*.csv` is the one-time export of the original Google Sheet workbook
(Meta ad-daily facts, Google campaign-daily facts, declared manual monthly
actuals). The seed is idempotent — re-running never double-counts.

> Local dev caveat: PGlite is single-process. Stop the dev server before
> running `npm run seed` / `npm run sync` locally, or restart it afterwards.
> (Not an issue in production — Postgres handles concurrent connections.)

## Recurring data (Sheets sync + Drive creatives)

Copy `.env.example` → `.env` and fill in:

- `GOOGLE_SA_KEY_FILE` (or base64 `GOOGLE_SA_KEY`) — Google Cloud service
  account with Sheets + Drive read-only; share the sheet AND the creatives
  folder with its `client_email`
- `SHEET_ID` — the workbook
- `DRIVE_FOLDER_ID` — the creatives folder
- `SYNC_SECRET` — protects `POST /api/v1/sync`

Then: `npm run sync` (sheet → DB) and `npm run index-drive` (Drive files →
`creative_assets` + auto exact/fuzzy matching). In production the Vercel cron
(`vercel.json`, every 2h) hits `/api/v1/sync` which does both. Fuzzy matches
are confirmed and manual links made at `/[client]/internal`.

## Production (when ready)

1. Create a Supabase project, get the `DATABASE_URL` connection string.
2. `DATABASE_URL=postgres://… npm run seed` — migrations apply automatically, then data loads.
3. Deploy to Vercel with `DATABASE_URL`, `GOOGLE_SA_KEY`, `SHEET_ID`, `DRIVE_FOLDER_ID`, `SYNC_SECRET` (+`CRON_SECRET`) set.

## Structure

```
supabase/migrations/   schema (entities, facts, manual actuals, semantic layer)
scripts/seed.ts        CSV → DB, entity resolution by name, idempotent upserts
src/lib/db.ts          PGlite (dev) / node-postgres (prod) behind one interface
src/lib/queries.ts     ALL metric math lives here (mirrors metric_definitions)
src/app/[client]/      Overview · Creatives · Campaigns · Platforms · Monthly report
src/app/api/v1/        REST endpoints (same query layer)
```

## Not yet built (per ARCHITECTURE.md phases)

- Alerts engine, agency health score
- Auth/RLS client logins (internal page is currently unprotected — add auth before public deploy)
- AI assistant
