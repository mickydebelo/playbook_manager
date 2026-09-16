import { getDbHandle } from "../src/server/db/client";
const h = await getDbHandle();
const cols = await h.db.execute(`select column_name from information_schema.columns where table_name='jobs' order by column_name`);
const rows = (Array.isArray(cols) ? cols : (cols as unknown as { rows: { column_name: string }[] }).rows) as { column_name: string }[];
console.log("jobs columns:", rows.map((r) => r.column_name).join(", "));
const applied = await h.db.execute(`select hash, created_at from drizzle.__drizzle_migrations order by created_at`);
const m = (Array.isArray(applied) ? applied : (applied as unknown as { rows: unknown[] }).rows) as unknown[];
console.log("migrations applied:", m.length);
await h.close();
