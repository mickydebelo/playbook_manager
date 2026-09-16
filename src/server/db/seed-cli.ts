import { getDbHandle } from "./client";
import { seedDatabase } from "./seed";
import { seedKnowledge } from "./seed-knowledge";
import { isAiConfigured } from "../ai/aps-client";

// `npm run db:seed` — idempotent. Reports totals as well as what this run created, so a second run
// is obviously a no-op rather than looking like a failure.
const handle = await getDbHandle();
const core = await seedDatabase(handle.db, { withSamples: process.env.NODE_ENV !== "production" });
console.log("Core seed — created:", core);

if (!isAiConfigured()) {
  console.log("APS credentials absent: seeding the knowledge corpus without embeddings (retrieval falls back to keyword search).");
}
const knowledge = await seedKnowledge(handle.db);
console.log("Knowledge seed — created:", knowledge);

const totals = await handle.db.execute(
  `select
     (select count(*) from users)::int as users,
     (select count(*) from templates)::int as templates,
     (select count(*) from playbooks)::int as playbooks,
     (select count(*) from knowledge_sources)::int as sources,
     (select count(*) from source_chunks)::int as chunks,
     (select count(*) from source_chunks where embedding is not null)::int as embedded`,
);
const row = (Array.isArray(totals) ? totals[0] : (totals as unknown as { rows: unknown[] }).rows[0]) as Record<string, number>;
console.log("Database totals:", row);

await handle.close();
