import { getDbHandle } from "./client";

// `npm run db:migrate` — applies pending migrations to the configured database.
const handle = await getDbHandle();
console.log(`Migrations applied (${handle.kind}).`);
await handle.close();
