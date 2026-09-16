import { asc, eq } from "drizzle-orm";
import type { Db } from "../../../db/client";
import { briefSources, briefs, customers, playbooks } from "../../../db/schema";
import { notFound } from "../../../http/errors";
import type { BriefContext } from "../../../ai/prompts/playbook";

/**
 * Loads the step-1 brief in the shape the prompts expect, including the reference links the
 * consultant supplied. Those links were previously stored and never read by anything.
 */
export async function loadBriefContext(db: Db, playbookId: string): Promise<BriefContext> {
  const [row] = await db
    .select({ playbook: playbooks, brief: briefs, customer: customers })
    .from(playbooks)
    .innerJoin(briefs, eq(briefs.playbookId, playbooks.id))
    .innerJoin(customers, eq(customers.id, playbooks.customerId))
    .where(eq(playbooks.id, playbookId))
    .limit(1);
  if (!row) throw notFound("Playbook");

  const links = await db
    .select({ kind: briefSources.kind, title: briefSources.title, url: briefSources.url })
    .from(briefSources)
    .where(eq(briefSources.playbookId, playbookId))
    .orderBy(asc(briefSources.position));

  return {
    playbookTitle: row.playbook.title,
    customerId: row.customer.id,
    customerName: row.customer.name,
    industry: row.customer.industry,
    sizeBand: row.customer.sizeBand,
    objective: row.brief.objective,
    focusAreas: row.brief.focusAreas,
    additionalContext: row.brief.additionalContext,
    briefSources: links.filter((l) => l.title.trim()),
  };
}

/**
 * The text a section is matched against during retrieval: where it sits in the playbook, plus what
 * the customer is trying to achieve. Shared by find-knowledge and drafting so both rank on the
 * same notion of "what this section is about".
 */
export function sectionTopic(params: { chapterTitle: string; sectionTitle: string; brief: BriefContext }): string {
  return [params.chapterTitle, params.sectionTitle, params.brief.objective, params.brief.focusAreas.join(" ")]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(". ");
}
