import { eq } from "drizzle-orm";
import { chapters, sections } from "../../../db/schema";
import { embedText, invokeJson, isAiConfigured } from "../../../ai/aps-client";
import { buildSystemPrompt, outlinePrompt, type BriefContext } from "../../../ai/prompts/playbook";
import * as knowledge from "../../knowledge/repository";
import { recomputeCoverage } from "../../sections/repository";
import type { JobContext } from "../worker";
import { loadBriefContext, sectionTopic } from "./context";

/** Sources proposed per section. */
const CANDIDATES_PER_SECTION = 6;
/**
 * Cosine distance bands for the relevance badge, tuned against the seeded corpus where a strongly
 * on-topic passage scores about 0.25–0.42 and a loosely related one about 0.55–0.60.
 */
const HIGH_RELEVANCE_BELOW = 0.42;
const MEDIUM_RELEVANCE_BELOW = 0.58;

type ProposedOutline = { chapters: { title: string; sections?: { title: string }[] }[] };

function parseOutline(value: unknown): ProposedOutline {
  const v = value as ProposedOutline;
  if (!v || !Array.isArray(v.chapters) || !v.chapters.length) throw new Error("Outline had no chapters");
  return {
    chapters: v.chapters.slice(0, 10).map((c) => ({
      title: String(c.title ?? "Untitled").slice(0, 200),
      sections: (Array.isArray(c.sections) ? c.sections : []).slice(0, 6).map((s) => ({ title: String(s.title ?? "Untitled").slice(0, 200) })),
    })),
  };
}

/**
 * A sensible, deterministic playbook structure used when the AI gateway cannot propose one (not
 * configured, unreachable, or a malformed reply). It is built from the brief's focus areas so it is
 * still tailored, and it means a brand-new playbook always lands on an editable Step 2 rather than a
 * blank page. The consultant can rename, add and remove chapters and sections from here.
 */
function fallbackOutline(brief: BriefContext): ProposedOutline {
  const focus = brief.focusAreas.map((f) => f.trim()).filter(Boolean).slice(0, 6);
  const approach = focus.length
    ? focus.map((f) => ({ title: f }))
    : [{ title: "Proposed solution" }, { title: "Key capabilities" }];
  return {
    chapters: [
      { title: "Executive summary", sections: [{ title: "Overview and objectives" }] },
      { title: "Current state and challenges", sections: [{ title: "Where the customer is today" }] },
      { title: "Recommended approach", sections: approach },
      { title: "Implementation roadmap", sections: [{ title: "Phases and milestones" }] },
      { title: "Success metrics", sections: [{ title: "How we measure impact" }] },
    ],
  };
}

function relevanceFor(distance: number): "high" | "medium" | "low" {
  if (distance < HIGH_RELEVANCE_BELOW) return "high";
  if (distance < MEDIUM_RELEVANCE_BELOW) return "medium";
  return "low";
}

/** A short phrase from the matching passage, so "Relevant for" says why this source appeared. */
function relevantForFrom(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentence = cleaned.split(/(?<=[.;])\s/)[0] ?? cleaned;
  return sentence.length > 90 ? `${sentence.slice(0, 87)}…` : sentence;
}

/**
 * Step 1 → 2. Proposes the chapter structure when the playbook has none, then finds candidate
 * sources for every section by embedding the section's topic and searching the chunk index.
 */
export async function findKnowledgeHandler({ db, job, progress }: JobContext): Promise<Record<string, unknown>> {
  const playbookId = job.targetId;
  const brief = await loadBriefContext(db, playbookId);

  await progress({ done: 0, total: 1, label: "Reviewing the brief" });

  let chapterRows = await db.select().from(chapters).where(eq(chapters.playbookId, playbookId)).orderBy(chapters.position);
  let outlineProposed = false;

  if (chapterRows.length === 0) {
    // Prefer an AI-proposed structure, but never let its absence or failure block the playbook:
    // fall back to a deterministic outline so Step 2 is always populated and editable.
    let proposed: ProposedOutline | null = null;
    if (isAiConfigured()) {
      await progress({ done: 0, total: 1, label: "Proposing a structure" });
      try {
        proposed = await invokeJson({
          tier: "fast",
          system: buildSystemPrompt(brief, "outline"),
          maxTokens: 1500,
          temperature: 0.15,
          messages: [{ role: "user", content: outlinePrompt(brief) }],
          shape: parseOutline,
        });
      } catch (err) {
        // AI gateway unreachable or the reply was unusable — log and use the deterministic outline.
        console.error(`[jobs] find_knowledge outline proposal failed, using fallback: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!proposed) proposed = fallbackOutline(brief);
    for (const [ci, chapter] of proposed.chapters.entries()) {
      const [created] = await db.insert(chapters).values({ playbookId, title: chapter.title, position: ci }).returning();
      const kids = chapter.sections ?? [];
      if (kids.length) {
        await db.insert(sections).values(kids.map((s, si) => ({ playbookId, chapterId: created!.id, title: s.title, position: si })));
      } else {
        // A chapter with no sections still needs one body section to hold its draft.
        await db.insert(sections).values({ playbookId, chapterId: created!.id, title: chapter.title, position: 0 });
      }
    }
    outlineProposed = true;
    chapterRows = await db.select().from(chapters).where(eq(chapters.playbookId, playbookId)).orderBy(chapters.position);
  }

  const sectionRows = await db.select().from(sections).where(eq(sections.playbookId, playbookId)).orderBy(sections.position);
  const chapterTitle = new Map(chapterRows.map((c) => [c.id, c.title]));

  // Starts as vector search when possible, but degrades to keyword search on the first embedding
  // failure so an unreachable AI gateway yields best-effort sources instead of failing the job.
  let vectorMode = isAiConfigured() && (await knowledge.hasEmbeddings(db));
  let matched = 0;

  for (const [i, section] of sectionRows.entries()) {
    await progress({ done: i, total: sectionRows.length, label: `Finding sources for ${section.title}` });
    const topic = sectionTopic({ chapterTitle: chapterTitle.get(section.chapterId) ?? "", sectionTitle: section.title, brief });

    // Retrieval is scoped to this customer: shared sources plus their own, never another's.
    // `includeUnapproved` surfaces relevant but not-yet-approved uploads so they can be reviewed and
    // selected here; the customer boundary and archived exclusion still hold.
    const keywordTerms = [section.title, ...brief.focusAreas].flatMap((t) => t.split(/\s+/));
    let matches: Awaited<ReturnType<typeof knowledge.searchChunksByText>>;
    if (vectorMode) {
      try {
        matches = await knowledge.searchChunksByVector(db, await embedText(topic), brief.customerId, 60, { includeUnapproved: true });
      } catch (err) {
        console.error(`[jobs] find_knowledge embedding failed, falling back to keyword search: ${err instanceof Error ? err.message : String(err)}`);
        vectorMode = false;
        matches = await knowledge.searchChunksByText(db, keywordTerms, brief.customerId, 60, { includeUnapproved: true });
      }
    } else {
      matches = await knowledge.searchChunksByText(db, keywordTerms, brief.customerId, 60, { includeUnapproved: true });
    }

    // Best chunk per source, then the closest few sources.
    const bySource = new Map<string, { distance: number; text: string }>();
    for (const m of matches) {
      const current = bySource.get(m.sourceId);
      if (!current || m.distance < current.distance) bySource.set(m.sourceId, { distance: m.distance, text: m.text });
    }
    const ranked = [...bySource.entries()].sort((a, b) => a[1].distance - b[1].distance).slice(0, CANDIDATES_PER_SECTION);

    await knowledge.replaceCandidates(
      db,
      section.id,
      ranked.map(([sourceId, best]) => ({
        sourceId,
        relevance: relevanceFor(best.distance),
        score: Number((1 - best.distance).toFixed(4)),
        relevantFor: relevantForFrom(best.text),
      })),
    );
    matched += ranked.length;
  }

  await recomputeCoverage(db, playbookId);
  await progress({ done: sectionRows.length, total: sectionRows.length, label: "Done" });

  return {
    outlineProposed,
    chapters: chapterRows.length,
    sections: sectionRows.length,
    candidates: matched,
    retrieval: vectorMode ? "vector" : "keyword",
  };
}
