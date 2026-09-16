import { and, eq } from "drizzle-orm";
import { chapters, sections, sectionSources } from "../../../db/schema";
import { invokeModel, isAiConfigured } from "../../../ai/aps-client";
import { buildSystemPrompt, draftPrompt, regeneratePrompt, type BriefContext, type SourceExcerpt } from "../../../ai/prompts/playbook";
import type { Db } from "../../../db/client";
import { excerptsForSources, EXCERPTS_PER_SECTION, EXCERPTS_PER_SOURCE } from "../../knowledge/excerpts";
import { writeGeneratedContent } from "../../sections/service";
import type { JobContext } from "../worker";
import { loadBriefContext, sectionTopic } from "./context";

/** Two at a time: fast enough for an eight-section playbook without hammering the gateway. */
const DRAFT_CONCURRENCY = 2;

/**
 * The passages from the consultant's selected sources that best match this section.
 *
 * This is the whole point of selecting sources in step 2. The previous implementation took the
 * first three chunks of each source by position — effectively page one of every document — so a
 * section about audit trails was drafted from a document's opening paragraphs. Now each section
 * retrieves against its own topic, and each excerpt keeps its provenance so the prompt can cite it.
 */
export async function excerptsForSection(
  db: Db,
  section: typeof sections.$inferSelect,
  chapterTitle: string,
  brief: BriefContext,
): Promise<SourceExcerpt[]> {
  const rows = await db
    .select({ sourceId: sectionSources.sourceId })
    .from(sectionSources)
    .where(and(eq(sectionSources.sectionId, section.id), eq(sectionSources.selected, true)));
  if (!rows.length) return [];

  return excerptsForSources(db, {
    sourceIds: rows.map((r) => r.sourceId),
    topic: sectionTopic({ chapterTitle, sectionTitle: section.title, brief }),
    perSource: EXCERPTS_PER_SOURCE,
    total: EXCERPTS_PER_SECTION,
  });
}

async function draftOne(db: Db, brief: BriefContext, section: typeof sections.$inferSelect, chapterTitle: string): Promise<number> {
  const excerpts = await excerptsForSection(db, section, chapterTitle, brief);
  const { text, outputTokens } = await invokeModel({
    tier: "quality",
    system: buildSystemPrompt(brief, "draft"),
    maxTokens: 1200,
    temperature: 0.4,
    messages: [{ role: "user", content: draftPrompt({ sectionTitle: section.title, chapterTitle, excerpts }) }],
  });
  await writeGeneratedContent(db, section.id, text, "edit");
  return outputTokens;
}

/**
 * Step 2 → 3. Drafts every section of the playbook from the sources the consultant selected.
 * Sections already holding content are skipped unless the payload asks for a rewrite.
 */
export async function createDraftHandler({ db, job, payload, progress }: JobContext): Promise<Record<string, unknown>> {
  if (!isAiConfigured()) throw new Error("The AI gateway is not configured");
  const playbookId = job.targetId;
  const brief = await loadBriefContext(db, playbookId);
  const overwrite = payload.overwrite === true;

  const chapterRows = await db.select().from(chapters).where(eq(chapters.playbookId, playbookId)).orderBy(chapters.position);
  const chapterTitle = new Map(chapterRows.map((c) => [c.id, c.title]));
  const all = await db.select().from(sections).where(eq(sections.playbookId, playbookId)).orderBy(sections.position);
  const todo = all.filter((s) => overwrite || !s.contentMd.trim());

  if (!todo.length) return { drafted: 0, skipped: all.length };

  let done = 0;
  let tokens = 0;
  const failures: string[] = [];
  let cursor = 0;

  // Progress is reported on completion, not on start: with two workers, reporting before the work
  // made the label flap between sections and the count run ahead of what had actually been written.
  await progress({ done: 0, total: todo.length, label: `Drafting ${todo[0]!.title}` });

  const workers = Array.from({ length: Math.min(DRAFT_CONCURRENCY, todo.length) }, async () => {
    while (cursor < todo.length) {
      const section = todo[cursor++]!;
      try {
        tokens += await draftOne(db, brief, section, chapterTitle.get(section.chapterId) ?? brief.playbookTitle);
      } catch (err) {
        failures.push(`${section.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
      done++;
      const next = todo[cursor];
      await progress({ done, total: todo.length, label: next ? `Drafting ${next.title}` : "Finishing up" });
    }
  });
  await Promise.all(workers);

  // A partial failure should not discard the sections that did draft.
  if (failures.length === todo.length) throw new Error(`Every section failed to draft. First error — ${failures[0]}`);
  return { drafted: todo.length - failures.length, skipped: all.length - todo.length, failures, outputTokens: tokens };
}

/** Step 3 "Regenerate section", optionally steered by an instruction from the assistant. */
export async function regenerateSectionHandler({ db, job, payload, progress }: JobContext): Promise<Record<string, unknown>> {
  if (!isAiConfigured()) throw new Error("The AI gateway is not configured");
  const sectionId = job.targetId;
  const [section] = await db.select().from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (!section) throw new Error("Section not found");

  const brief = await loadBriefContext(db, section.playbookId);
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, section.chapterId)).limit(1);
  const chapterTitle = chapter?.title ?? brief.playbookTitle;
  await progress({ done: 0, total: 1, label: `Regenerating ${section.title}` });

  const instruction = typeof payload.instruction === "string" ? payload.instruction : undefined;
  // A rewrite keeps its sources: the previous version dropped them, so regenerating quietly
  // replaced grounded text with whatever the model remembered.
  const excerpts = await excerptsForSection(db, section, chapterTitle, brief);

  const prompt = section.contentMd.trim()
    ? regeneratePrompt({ sectionTitle: section.title, current: section.contentMd, excerpts, instruction })
    : draftPrompt({ sectionTitle: section.title, chapterTitle, excerpts });

  const { text, outputTokens } = await invokeModel({
    tier: "quality",
    system: buildSystemPrompt(brief, "draft"),
    maxTokens: 1200,
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }],
  });
  await writeGeneratedContent(db, sectionId, text, "regenerate");
  await progress({ done: 1, total: 1, label: "Done" });
  return { sectionId, outputTokens };
}
