/**
 * Database layer.
 *
 * - Local dev (no DATABASE_URL): embedded Postgres via PGlite, persisted to .pglite/.
 *   Zero external services needed — the seeded workbook data lives here.
 * - Production (DATABASE_URL set): node-postgres pool against Supabase.
 *
 * Both paths speak the same SQL; migrations in supabase/migrations/ run on either.
 */
import fs from "node:fs";
import path from "node:path";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute multi-statement SQL (migrations). */
  exec(sql: string): Promise<void>;
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function runMigrations(db: Db) {
  await db.query(
    `create table if not exists _migrations (name text primary key, ran_at timestamptz default now())`
  );
  const done = new Set(
    (await db.query<{ name: string }>(`select name from _migrations`)).map((r) => r.name)
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.exec(sql);
    await db.query(`insert into _migrations (name) values ($1)`, [file]);
    console.log(`[db] applied migration ${file}`);
  }
}

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 10 });
    db = {
      async query(sql, params) {
        const res = await pool.query(sql, params as unknown[]);
        return res.rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = path.join(process.cwd(), ".pglite");
    const pg = await PGlite.create(dataDir);
    db = {
      async query(sql, params) {
        const res = await pg.query(sql, params as unknown[]);
        return res.rows as never[];
      },
      async exec(sql) {
        await pg.exec(sql);
      },
    };
  }
  await runMigrations(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}
