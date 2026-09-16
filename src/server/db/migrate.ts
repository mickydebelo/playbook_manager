import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/**
 * Applies the committed SQL migrations in ./drizzle. The pgvector extension is created first because
 * drizzle-kit does not emit CREATE EXTENSION; `IF NOT EXISTS` keeps this idempotent on managed Postgres.
 */
export async function runMigrations(db: Db, kind: "pglite" | "pg"): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  const opts = { migrationsFolder: MIGRATIONS_FOLDER };
  if (kind === "pglite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePglite(db as any, opts);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePg(db as any, opts);
  }
}
