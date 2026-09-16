import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { briefs, chapters, customers, knowledgeSources, playbooks, sections, sectionSources } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { notFound } from "../../http/errors";
import { requireReadablePlaybook } from "../sections/service";
import { coverSubtitle, renderPlaybookHtml, type RenderChapter, type RenderInput } from "./render-html";
import type { DocumentAssets } from "./assets";

/**
 * Assembles the whole playbook into the renderer's input shape. One place builds the document
 * model, so the preview, the PDF and the Word file always describe the same thing.
 */
export async function buildRenderInput(
  db: Db,
  user: CurrentUser,
  playbookId: string,
  opts: { includeSources?: boolean; assets?: DocumentAssets } = {},
): Promise<RenderInput> {
  await requireReadablePlaybook(db, user, playbookId);

  const [head] = await db
    .select({ playbook: playbooks, brief: briefs, customer: customers })
    .from(playbooks)
    .innerJoin(briefs, eq(briefs.playbookId, playbooks.id))
    .innerJoin(customers, eq(customers.id, playbooks.customerId))
    .where(eq(playbooks.id, playbookId))
    .limit(1);
  if (!head) throw notFound("Playbook");

  const chapterRows = await db.select().from(chapters).where(eq(chapters.playbookId, playbookId)).orderBy(asc(chapters.position));
  const sectionRows = await db.select().from(sections).where(eq(sections.playbookId, playbookId)).orderBy(asc(sections.position));

  const renderChapters: RenderChapter[] = chapterRows.map((c, ci) => ({
    title: c.title,
    number: `${ci + 1}.`,
    sections: sectionRows
      .filter((s) => s.chapterId === c.id && !s.parentSectionId)
      .map((s, si) => ({ title: s.title, number: `${ci + 1}.${si + 1}`, contentMd: s.contentMd })),
  }));

  let sources: RenderInput["sources"];
  if (opts.includeSources) {
    const rows = await db
      .selectDistinct({ title: knowledgeSources.title, ownerOrg: knowledgeSources.ownerOrg, year: knowledgeSources.year })
      .from(sectionSources)
      .innerJoin(sections, eq(sections.id, sectionSources.sectionId))
      .innerJoin(knowledgeSources, eq(knowledgeSources.id, sectionSources.sourceId))
      .where(and(eq(sections.playbookId, playbookId), eq(sectionSources.selected, true)))
      .orderBy(asc(knowledgeSources.title));
    sources = rows;
  }

  return {
    title: head.playbook.title.toLowerCase().includes(head.customer.name.toLowerCase())
      ? head.playbook.title
      : `${head.playbook.title} for ${head.customer.name}`,
    customerName: head.customer.name,
    industry: head.customer.industry,
    subtitle: coverSubtitle(head.brief.objective, head.customer.name, head.customer.industry),
    version: `${head.playbook.version}.0`,
    date: head.playbook.updatedAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    chapters: renderChapters,
    sources,
    assets: opts.assets,
    draft: head.playbook.status !== "delivered",
  };
}

export async function renderPlaybookPreview(
  db: Db,
  user: CurrentUser,
  playbookId: string,
  opts: { includeSources?: boolean; assets?: DocumentAssets } = {},
): Promise<string> {
  return renderPlaybookHtml(await buildRenderInput(db, user, playbookId, opts));
}
