import { eq, inArray } from "drizzle-orm";
import { chapters, knowledgeSources } from "../../db/schema";
import { embedText, isAiConfigured } from "../../ai/aps-client";
import type { SourceExcerpt } from "../../ai/prompts/playbook";
import type { Db } from "../../db/client";
import type { CurrentUser } from "../../auth/current-user";
import { notFound } from "../../http/errors";
import { loadBriefContext, sectionTopic } from "../jobs/handlers/context";
import { requireSection } from "../sections/service";
import { chunksForSources, getSource, topChunksForSection } from "./repository";

/** How many passages one section's prompt may carry, and how many any single source may contribute. */
export const EXCERPTS_PER_SECTION = 12;
export const EXCERPTS_PER_SOURCE = 3;
/** A preview panel shows one source, so it can afford more of that source's passages. */
const PREVIEW_EXCERPTS = 6;
/** Long enough to judge relevance, short enough to keep a prompt and a panel readable. */
const EXCERPT_CHARS = 1200;

export type RankedExcerpt = SourceExcerpt & { sourceId: string; distance: number | null };

/**
 * The passages from a set of sources that best match a topic, ranked by cosine distance.
 *
 * Shared deliberately by drafting and by the step-2 preview: the excerpts a consultant is shown as
 * the reason a source was proposed must be the same ones the draft is then grounded in. Retrieval
 * that disagreed with its own explanation would be worse than no explanation.
 */
export async function excerptsForSources(
  db: Db,
  params: { sourceIds: string[]; topic: string; perSource?: number; total?: number },
): Promise<RankedExcerpt[]> {
  const { sourceIds, topic } = params;
  const perSource = params.perSource ?? EXCERPTS_PER_SOURCE;
  const total = params.total ?? EXCERPTS_PER_SECTION;
  if (!sourceIds.length) return [];

  const rows = await db.select().from(knowledgeSources).where(inArray(knowledgeSources.id, sourceIds));
  const byId = new Map(rows.map((r) => [r.id, r]));

  let matches: { sourceId: string; text: string; pageNo: number | null; distance: number | null }[] = [];
  if (isAiConfigured()) {
    try {
      matches = await topChunksForSection(db, { sourceIds, embedding: await embedText(topic), perSource, total });
    } catch {
      // Fall through to the positional fallback rather than failing the whole request.
      matches = [];
    }
  }

  // No embeddings (or retrieval unavailable): fall back to the opening passages of each source.
  if (!matches.length) {
    const chunks = await chunksForSources(db, sourceIds, perSource);
    matches = sourceIds.flatMap((id) => (chunks.get(id) ?? []).map((text) => ({ sourceId: id, text, pageNo: null, distance: null })));
  }

  return matches.slice(0, total).flatMap((m, i) => {
    const source = byId.get(m.sourceId);
    if (!source) return [];
    return [
      {
        n: i + 1,
        sourceId: m.sourceId,
        sourceTitle: source.title,
        ownerOrg: source.ownerOrg,
        year: source.year,
        pageNo: m.pageNo,
        distance: m.distance,
        text: m.text.slice(0, EXCERPT_CHARS),
      },
    ];
  });
}

/**
 * Why this source was proposed for this section, in the source's own words.
 *
 * Step 2 used to render a decorative mock of a document cover with page controls that changed
 * nothing. The ranked passages exist, so the panel shows them instead: the extraction becomes
 * visible at the moment of selection rather than only implicitly in the later draft.
 */
export async function listSectionSourceExcerpts(db: Db, user: CurrentUser, sectionId: string, sourceId: string) {
  const section = await requireSection(db, user, sectionId, false);
  const source = await getSource(db, sourceId);
  if (!source) throw notFound("Source");

  const brief = await loadBriefContext(db, section.playbookId);
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, section.chapterId)).limit(1);
  const topic = sectionTopic({ chapterTitle: chapter?.title ?? brief.playbookTitle, sectionTitle: section.title, brief });

  const excerpts = await excerptsForSources(db, {
    sourceIds: [sourceId],
    topic,
    perSource: PREVIEW_EXCERPTS,
    total: PREVIEW_EXCERPTS,
  });

  return {
    sourceId,
    sourceTitle: source.title,
    sectionTitle: section.title,
    /** The string retrieval actually ranked against, so the panel can explain and highlight the match. */
    topic,
    excerpts: excerpts.map((e) => ({
      n: e.n,
      text: e.text,
      pageNo: e.pageNo,
      /** Cosine similarity, the same 1 - distance the candidate list scores with. */
      score: e.distance === null ? null : Math.round((1 - e.distance) * 1000) / 1000,
    })),
  };
}
