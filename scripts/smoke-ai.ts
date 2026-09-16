/**
 * End-to-end check of the AI path against the real Autodesk gateway:
 * gateway reachable → corpus embedded → find_knowledge proposes an outline and retrieves sources.
 *
 *   npm run smoke:ai            # outline + retrieval
 *   npm run smoke:ai -- --draft # also drafts one section with the quality model (slow)
 *
 * Creates a throwaway playbook and deletes it at the end.
 */
import { eq } from "drizzle-orm";
import { getDbHandle } from "../src/server/db/client";
import { chapters, knowledgeSources, playbooks, sections, sectionSources, users } from "../src/server/db/schema";
import { createPlaybook } from "../src/server/modules/playbooks/service";
import { enqueueAndKick, getJob, registerAllJobHandlers } from "../src/server/modules/jobs";
import { drainJobs } from "../src/server/modules/jobs/worker";
import { isAiConfigured } from "../src/server/ai/aps-client";

const withDraft = process.argv.includes("--draft");
/** `--industry dm --objective "..." --focus "a,b"` so the brief can be varied when checking steering. */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const handle = await getDbHandle();
const db = handle.db;

if (!isAiConfigured()) {
  console.error("APS_CLIENT_ID / APS_CLIENT_SECRET are not set. Add them to .env and retry.");
  process.exit(1);
}

registerAllJobHandlers();
const [u] = await db.select().from(users).limit(1);
if (!u) {
  console.error("No users. Run `npm run db:seed` first.");
  process.exit(1);
}
const me = { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role };

const playbook = await createPlaybook(db, me, {
  customerName: `Smoke test ${Date.now()}`,
  industry: arg("industry", "aeco") as "aeco" | "dm" | "me" | "public_sector" | "other",
  sizeBand: arg("size", "large") as "small" | "medium" | "large" | "enterprise",
  objective: arg("objective", "Support the adoption of connected document and project management, focusing on business strategy and project management."),
  focusAreas: arg("focus", "Business strategy,Project management,Document control").split(",").map((f) => f.trim()).filter(Boolean),
  additionalContext: arg("context", "ISO 19650 alignment matters to this customer."),
  sources: [],
  brandColor: null,
  logoAssetId: null,
});

async function run(type: "find_knowledge" | "create_draft", targetId: string) {
  const job = await enqueueAndKick(db, { type, targetType: "playbook", targetId, createdBy: me.id });
  const started = Date.now();
  await drainJobs(db);
  const done = await getJob(db, job.id);
  console.log(`\n${type}: ${done.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (done.error) console.log("  error:", done.error);
  if (done.result) console.log("  result:", done.result);
  return done;
}

try {
  await run("find_knowledge", playbook.id);

  const chs = await db.select().from(chapters).where(eq(chapters.playbookId, playbook.id)).orderBy(chapters.position);
  const secs = await db.select().from(sections).where(eq(sections.playbookId, playbook.id)).orderBy(sections.position);
  console.log(`\nOutline — ${chs.length} chapters, ${secs.length} sections`);
  for (const c of chs) {
    console.log(`  ${c.position + 1}. ${c.title}`);
    for (const s of secs.filter((x) => x.chapterId === c.id)) console.log(`       ${s.title}  [${s.coverage}]`);
  }

  const titles = new Map((await db.select().from(knowledgeSources)).map((s) => [s.id, s.title]));
  const sample = secs[Math.min(2, secs.length - 1)]!;
  const cands = await db.select().from(sectionSources).where(eq(sectionSources.sectionId, sample.id));
  console.log(`\nCandidates for "${sample.title}":`);
  for (const c of cands.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    console.log(`  [${c.relevance}] ${titles.get(c.sourceId)} (score ${c.score}) — ${c.relevantFor.slice(0, 70)}`);
  }

  if (withDraft) {
    // Draft needs selected sources; take the top two for one section.
    for (const c of cands.slice(0, 2)) {
      await db.update(sectionSources).set({ selected: true }).where(eq(sectionSources.sourceId, c.sourceId));
    }
    const { excerptsForSection } = await import("../src/server/modules/jobs/handlers/drafting");
    const { loadBriefContext } = await import("../src/server/modules/jobs/handlers/context");
    const [sectionRow] = await db.select().from(sections).where(eq(sections.id, sample.id));
    const fed = await excerptsForSection(db, sectionRow!, "", await loadBriefContext(db, playbook.id));
    console.log(`\nExcerpts fed to "${sample.title}" (relevance-ranked, not page one):`);
    for (const e of fed) console.log(`  [${e.n}] ${e.sourceTitle}${e.pageNo ? ` p.${e.pageNo}` : ""} — ${e.text.slice(0, 90)}`);

    await run("create_draft", playbook.id);
    const [drafted] = await db.select().from(sections).where(eq(sections.id, sample.id));
    console.log(`\nDraft of "${sample.title}" (${drafted?.wordCount} words):\n`);
    console.log((drafted?.contentMd ?? "").slice(0, 900));
  }
} finally {
  await db.delete(playbooks).where(eq(playbooks.id, playbook.id));
  await handle.close();
}
