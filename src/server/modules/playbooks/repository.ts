import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { briefSources, briefs, chapters, collaborators, customers, playbooks, sections, sectionSources, users } from "../../db/schema";
import type { PlaybookStatus } from "@/shared/enums";

export type PlaybookRow = typeof playbooks.$inferSelect;
export type BriefRow = typeof briefs.$inferSelect;
export type BriefSourceRow = typeof briefSources.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;

export type PlaybookAggregate = {
  playbook: PlaybookRow;
  customer: CustomerRow;
  brief: BriefRow;
  sources: BriefSourceRow[];
  chapters: (typeof chapters.$inferSelect)[];
  sections: ((typeof sections.$inferSelect) & { sourceCount: number })[];
  collaborators: { userId: string; role: "reviewer" | "editor"; name: string; email: string }[];
};

/** Playbooks visible to a user: owned, or shared through collaborators. Archived ones only when asked for. */
export async function listVisible(db: Db, userId: string, isAdmin: boolean, status?: PlaybookStatus) {
  const visibility = isAdmin
    ? sql`true`
    : or(
        eq(playbooks.ownerId, userId),
        sql`exists (select 1 from ${collaborators} c where c.playbook_id = ${playbooks.id} and c.user_id = ${userId})`,
      );
  const statusFilter = status ? eq(playbooks.status, status) : sql`${playbooks.status} <> 'archived'`;
  return db
    .select({ playbook: playbooks, customer: customers })
    .from(playbooks)
    .innerJoin(customers, eq(customers.id, playbooks.customerId))
    .where(and(visibility, statusFilter))
    .orderBy(desc(playbooks.updatedAt));
}

export async function loadAggregate(db: Db, id: string): Promise<PlaybookAggregate | null> {
  const [head] = await db
    .select({ playbook: playbooks, customer: customers, brief: briefs })
    .from(playbooks)
    .innerJoin(customers, eq(customers.id, playbooks.customerId))
    .innerJoin(briefs, eq(briefs.playbookId, playbooks.id))
    .where(eq(playbooks.id, id))
    .limit(1);
  if (!head) return null;
  const [sources, chapterRows, sectionRows, collabRows] = await Promise.all([
    db.select().from(briefSources).where(eq(briefSources.playbookId, id)).orderBy(briefSources.position),
    db.select().from(chapters).where(eq(chapters.playbookId, id)).orderBy(chapters.position),
    // Joined and grouped, not a correlated subquery — see the note in knowledge/repository.ts.
    db
      .select({ section: sections, sourceCount: sql<number>`count(${sectionSources.sourceId})::int` })
      .from(sections)
      .leftJoin(sectionSources, and(eq(sectionSources.sectionId, sections.id), eq(sectionSources.selected, true)))
      .where(eq(sections.playbookId, id))
      .groupBy(sections.id)
      .orderBy(sections.position),
    db
      .select({ userId: collaborators.userId, role: collaborators.role, name: users.name, email: users.email })
      .from(collaborators)
      .innerJoin(users, eq(users.id, collaborators.userId))
      .where(eq(collaborators.playbookId, id)),
  ]);
  return {
    ...head,
    sources,
    chapters: chapterRows,
    sections: sectionRows.map((r) => ({ ...r.section, sourceCount: Number(r.sourceCount ?? 0) })),
    collaborators: collabRows,
  };
}

export async function loadAccess(db: Db, id: string) {
  const [pb] = await db.select({ id: playbooks.id, ownerId: playbooks.ownerId, status: playbooks.status }).from(playbooks).where(eq(playbooks.id, id)).limit(1);
  if (!pb) return null;
  const collabs = await db
    .select({ userId: collaborators.userId, role: collaborators.role })
    .from(collaborators)
    .where(eq(collaborators.playbookId, id));
  return { ...pb, collaborators: collabs };
}

export async function replaceBriefSources(
  db: Db,
  playbookId: string,
  items: { kind: "doc" | "link"; title: string; url: string }[],
): Promise<void> {
  await db.delete(briefSources).where(eq(briefSources.playbookId, playbookId));
  if (items.length) {
    await db.insert(briefSources).values(items.map((s, i) => ({ playbookId, kind: s.kind, title: s.title, url: s.url, position: i })));
  }
}

export async function touch(db: Db, playbookId: string): Promise<void> {
  await db.update(playbooks).set({ updatedAt: new Date() }).where(eq(playbooks.id, playbookId));
}

export async function copyOutline(db: Db, fromPlaybookId: string, toPlaybookId: string): Promise<void> {
  const chapterRows = await db.select().from(chapters).where(eq(chapters.playbookId, fromPlaybookId)).orderBy(chapters.position);
  if (!chapterRows.length) return;
  const inserted = await db
    .insert(chapters)
    .values(chapterRows.map((c) => ({ playbookId: toPlaybookId, position: c.position, title: c.title })))
    .returning();
  const chapterMap = new Map(chapterRows.map((c, i) => [c.id, inserted[i]!.id]));
  const sectionRows = await db
    .select()
    .from(sections)
    .where(inArray(sections.chapterId, chapterRows.map((c) => c.id)))
    .orderBy(sections.position);
  // Two passes so parent_section_id can be remapped.
  const idMap = new Map<string, string>();
  for (const s of sectionRows.filter((s) => !s.parentSectionId)) {
    const [row] = await db
      .insert(sections)
      .values({ playbookId: toPlaybookId, chapterId: chapterMap.get(s.chapterId)!, position: s.position, title: s.title, contentMd: s.contentMd, wordCount: s.wordCount, coverage: s.coverage })
      .returning();
    idMap.set(s.id, row!.id);
  }
  for (const s of sectionRows.filter((s) => s.parentSectionId)) {
    const [row] = await db
      .insert(sections)
      .values({ playbookId: toPlaybookId, chapterId: chapterMap.get(s.chapterId)!, parentSectionId: idMap.get(s.parentSectionId!) ?? null, position: s.position, title: s.title, contentMd: s.contentMd, wordCount: s.wordCount, coverage: s.coverage })
      .returning();
    idMap.set(s.id, row!.id);
  }
}
