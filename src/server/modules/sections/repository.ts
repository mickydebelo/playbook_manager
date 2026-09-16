import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { chapters, playbooks, sections, sectionSources, sectionVersions } from "../../db/schema";
import type { Coverage } from "@/shared/enums";

export type ChapterRow = typeof chapters.$inferSelect;
export type SectionRow = typeof sections.$inferSelect;
export type SectionVersionRow = typeof sectionVersions.$inferSelect;

export async function loadChapter(db: Db, chapterId: string): Promise<ChapterRow | null> {
  const [row] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  return row ?? null;
}

export async function loadSection(db: Db, sectionId: string): Promise<SectionRow | null> {
  const [row] = await db.select().from(sections).where(eq(sections.id, sectionId)).limit(1);
  return row ?? null;
}

export async function listChapters(db: Db, playbookId: string): Promise<ChapterRow[]> {
  return db.select().from(chapters).where(eq(chapters.playbookId, playbookId)).orderBy(asc(chapters.position));
}

export async function listSections(db: Db, playbookId: string): Promise<SectionRow[]> {
  return db.select().from(sections).where(eq(sections.playbookId, playbookId)).orderBy(asc(sections.position));
}

export async function nextChapterPosition(db: Db, playbookId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${chapters.position}), -1) + 1` })
    .from(chapters)
    .where(eq(chapters.playbookId, playbookId));
  return Number(row?.next ?? 0);
}

export async function nextSectionPosition(db: Db, chapterId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${sections.position}), -1) + 1` })
    .from(sections)
    .where(eq(sections.chapterId, chapterId));
  return Number(row?.next ?? 0);
}

/** Renumbers a list of ids to 0..n-1 in the given order. */
export async function reorderChapters(db: Db, playbookId: string, orderedIds: string[]): Promise<void> {
  for (const [i, id] of orderedIds.entries()) {
    await db.update(chapters).set({ position: i, updatedAt: new Date() }).where(and(eq(chapters.id, id), eq(chapters.playbookId, playbookId)));
  }
}

export async function reorderSections(db: Db, chapterId: string, orderedIds: string[]): Promise<void> {
  for (const [i, id] of orderedIds.entries()) {
    await db.update(sections).set({ position: i, updatedAt: new Date() }).where(and(eq(sections.id, id), eq(sections.chapterId, chapterId)));
  }
}

export async function insertVersion(
  db: Db,
  input: { sectionId: string; contentMd: string; reason: SectionVersionRow["reason"]; createdBy: string | null },
): Promise<SectionVersionRow> {
  const [row] = await db.insert(sectionVersions).values(input).returning();
  return row!;
}

export async function listVersions(db: Db, sectionId: string): Promise<SectionVersionRow[]> {
  return db
    .select()
    .from(sectionVersions)
    .where(eq(sectionVersions.sectionId, sectionId))
    .orderBy(sql`${sectionVersions.createdAt} desc`);
}

export async function getVersion(db: Db, versionId: string): Promise<SectionVersionRow | null> {
  const [row] = await db.select().from(sectionVersions).where(eq(sectionVersions.id, versionId)).limit(1);
  return row ?? null;
}

/**
 * Coverage shown as the dot in the outline: none (no selected sources), thin (one),
 * ok (two or more). Recomputed whenever selections change.
 */
export function coverageFor(selectedCount: number): Coverage {
  if (selectedCount === 0) return "none";
  if (selectedCount === 1) return "thin";
  return "ok";
}

export async function recomputeCoverage(db: Db, playbookId: string): Promise<void> {
  const rows = await db
    .select({ sectionId: sections.id, n: sql<number>`count(${sectionSources.sourceId}) filter (where ${sectionSources.selected})::int` })
    .from(sections)
    .leftJoin(sectionSources, eq(sectionSources.sectionId, sections.id))
    .where(eq(sections.playbookId, playbookId))
    .groupBy(sections.id);
  for (const row of rows) {
    await db.update(sections).set({ coverage: coverageFor(Number(row.n ?? 0)) }).where(eq(sections.id, row.sectionId));
  }
}

export async function selectedSourceIds(db: Db, sectionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: sectionSources.sourceId })
    .from(sectionSources)
    .where(and(eq(sectionSources.sectionId, sectionId), eq(sectionSources.selected, true)));
  return rows.map((r) => r.id);
}

export async function touchPlaybook(db: Db, playbookId: string): Promise<void> {
  await db.update(playbooks).set({ updatedAt: new Date() }).where(eq(playbooks.id, playbookId));
}

export async function deleteSectionsCascade(db: Db, sectionIds: string[]): Promise<void> {
  if (sectionIds.length) await db.delete(sections).where(inArray(sections.id, sectionIds));
}
