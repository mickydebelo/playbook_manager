import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";
import { getEnv } from "../env";
import { runMigrations } from "./migrate";

/**
 * Database handle shared by repositories and services.
 * Both drivers (PGlite locally, node-postgres in staging/production) satisfy this type,
 * as do transactions, so services accept `Db` and never care which one they got.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema, any>;

export type DbHandle = { db: Db; kind: "pglite" | "pg"; close: () => Promise<void> };

/** Create an isolated in-memory database with migrations applied. Used by tests and by `createDatabase` for PGlite. */
export async function createPgliteDatabase(dataDir?: string): Promise<DbHandle> {
  if (dataDir) fs.mkdirSync(path.dirname(path.resolve(dataDir)), { recursive: true });
  // PGlite treats a non-string first argument as the options object, so pass a single object.
  const client = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await runMigrations(db, "pglite");
  return { db, kind: "pglite", close: () => client.close() };
}

export async function createPgDatabase(connectionString: string): Promise<DbHandle> {
  const pool = new Pool({ connectionString });
  const db = drizzlePg(pool, { schema }) as unknown as Db;
  await runMigrations(db, "pg");
  return { db, kind: "pg", close: () => pool.end() };
}

/**
 * Process-wide singleton kept on globalThis: Next.js dev bundles route handlers and server components into
 * separate module graphs, so a module-level variable would open the embedded database twice on the same directory.
 */
const g = globalThis as unknown as { __playbookManagerDb?: Promise<DbHandle> | null };

/** Process-wide database. Selected by DATABASE_URL (Postgres) or PGLITE_DATA_DIR (embedded). */
export function getDbHandle(): Promise<DbHandle> {
  if (!g.__playbookManagerDb) {
    const env = getEnv();
    g.__playbookManagerDb = env.DATABASE_URL ? createPgDatabase(env.DATABASE_URL) : createPgliteDatabase(env.PGLITE_DATA_DIR);
  }
  return g.__playbookManagerDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

/** Test helper: point the process-wide handle at a specific database. */
export function setDbHandleForTests(handle: DbHandle | null): void {
  g.__playbookManagerDb = handle ? Promise.resolve(handle) : null;
}

export { schema };
