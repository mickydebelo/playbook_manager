import type { Db } from "../../db/client";
import type { CurrentUser } from "../../auth/current-user";
import { notFound } from "../../http/errors";
import type { KnowledgeSourceDto, SectionCandidateDto } from "@/shared/contracts";
import { recomputeCoverage } from "../sections/repository";
import { requireSection } from "../sections/service";
import * as repo from "./repository";

export function toKnowledgeDto(row: repo.KnowledgeRow, usedIn: number): KnowledgeSourceDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    ownerOrg: row.ownerOrg,
    year: row.year,
    pageCount: row.pageCount,
    url: row.url,
    status: row.status,
    currency: row.currency,
    isExternal: row.isExternal,
    customerId: row.customerId,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    tags: row.tags,
    usedIn,
  };
}

export async function listLibrary(db: Db, opts: { q?: string; filter?: repo.LibraryFilter }): Promise<KnowledgeSourceDto[]> {
  const rows = await repo.listSources(db, opts);
  return rows.map((r) => toKnowledgeDto(r.source, Number(r.usedIn ?? 0)));
}

export async function getLibrarySource(db: Db, id: string): Promise<KnowledgeSourceDto> {
  const row = await repo.getSource(db, id);
  if (!row) throw notFound("Source");
  return toKnowledgeDto(row, 0);
}

/**
 * Candidates for the step-2 middle column. These are the rows a `find_knowledge` run proposed,
 * filtered client-side style by the search box and the approved-only toggle.
 */
export async function listSectionCandidates(
  db: Db,
  user: CurrentUser,
  sectionId: string,
  opts: { q?: string; approvedOnly?: boolean },
): Promise<SectionCandidateDto[]> {
  await requireSection(db, user, sectionId, false);
  const rows = await repo.listCandidatesForSection(db, sectionId);
  const q = opts.q?.trim().toLowerCase();
  return rows
    .filter((r) => !opts.approvedOnly || r.source.status === "approved")
    .filter((r) => !q || r.source.title.toLowerCase().includes(q) || r.source.ownerOrg.toLowerCase().includes(q))
    .map((r) => ({
      ...toKnowledgeDto(r.source, 0),
      relevance: r.link.relevance,
      score: r.link.score,
      relevantFor: r.link.relevantFor,
      selected: r.link.selected,
    }));
}

export async function setSectionSourceSelection(
  db: Db,
  user: CurrentUser,
  sectionId: string,
  sourceId: string,
  selected: boolean,
): Promise<void> {
  const section = await requireSection(db, user, sectionId, true);
  if (!(await repo.getSource(db, sourceId))) throw notFound("Source");
  await repo.setSelection(db, sectionId, sourceId, selected, user.id);
  await recomputeCoverage(db, section.playbookId);
}
