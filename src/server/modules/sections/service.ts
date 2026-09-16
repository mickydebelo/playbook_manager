import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { chapters, sections } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { conflict, notFound } from "../../http/errors";
import { assertCanEdit, assertCanRead } from "../playbooks/access";
import { loadAccess } from "../playbooks/repository";
import type { SectionDetail } from "@/shared/contracts";
import * as repo from "./repository";

/** Words as the editor counts them: markdown markers stripped, then whitespace-separated tokens. */
export function countWords(markdown: string): number {
  return markdown
    .replace(/[#>*_`-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function toSectionDetail(row: repo.SectionRow): SectionDetail {
  return {
    id: row.id,
    playbookId: row.playbookId,
    chapterId: row.chapterId,
    parentSectionId: row.parentSectionId,
    title: row.title,
    position: row.position,
    contentMd: row.contentMd,
    wordCount: row.wordCount,
    coverage: row.coverage,
    contentSavedAt: row.contentSavedAt?.toISOString() ?? null,
  };
}

async function accessForPlaybook(db: Db, playbookId: string) {
  const access = await loadAccess(db, playbookId);
  if (!access) throw notFound("Playbook");
  return access;
}

export async function requireReadablePlaybook(db: Db, user: CurrentUser, playbookId: string) {
  const access = await accessForPlaybook(db, playbookId);
  assertCanRead(access, user);
  return access;
}

export async function requireEditablePlaybook(db: Db, user: CurrentUser, playbookId: string) {
  const access = await accessForPlaybook(db, playbookId);
  assertCanEdit(access, user);
  if (access.status === "archived") throw conflict("Archived playbooks are read-only");
  return access;
}

async function requireChapter(db: Db, user: CurrentUser, chapterId: string, write: boolean) {
  const chapter = await repo.loadChapter(db, chapterId);
  if (!chapter) throw notFound("Chapter");
  if (write) await requireEditablePlaybook(db, user, chapter.playbookId);
  else await requireReadablePlaybook(db, user, chapter.playbookId);
  return chapter;
}

export async function requireSection(db: Db, user: CurrentUser, sectionId: string, write: boolean) {
  const section = await repo.loadSection(db, sectionId);
  if (!section) throw notFound("Section");
  if (write) await requireEditablePlaybook(db, user, section.playbookId);
  else await requireReadablePlaybook(db, user, section.playbookId);
  return section;
}

// ---- Chapters --------------------------------------------------------------

export async function addChapter(db: Db, user: CurrentUser, playbookId: string, input: { title: string }) {
  await requireEditablePlaybook(db, user, playbookId);
  const position = await repo.nextChapterPosition(db, playbookId);
  const [row] = await db.insert(chapters).values({ playbookId, title: input.title, position }).returning();
  await repo.touchPlaybook(db, playbookId);
  return row!;
}

export async function updateChapter(db: Db, user: CurrentUser, chapterId: string, patch: { title?: string; position?: number }) {
  const chapter = await requireChapter(db, user, chapterId, true);
  const [row] = await db
    .update(chapters)
    .set({ ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.position !== undefined ? { position: patch.position } : {}), updatedAt: new Date() })
    .where(eq(chapters.id, chapterId))
    .returning();
  await repo.touchPlaybook(db, chapter.playbookId);
  return row!;
}

export async function removeChapter(db: Db, user: CurrentUser, chapterId: string): Promise<void> {
  const chapter = await requireChapter(db, user, chapterId, true);
  // Sections cascade at the database level.
  await db.delete(chapters).where(eq(chapters.id, chapterId));
  const remaining = await repo.listChapters(db, chapter.playbookId);
  await repo.reorderChapters(db, chapter.playbookId, remaining.map((c) => c.id));
  await repo.touchPlaybook(db, chapter.playbookId);
}

export async function reorderChapters(db: Db, user: CurrentUser, playbookId: string, orderedIds: string[]): Promise<void> {
  await requireEditablePlaybook(db, user, playbookId);
  await repo.reorderChapters(db, playbookId, orderedIds);
  await repo.touchPlaybook(db, playbookId);
}

// ---- Sections --------------------------------------------------------------

export async function addSection(db: Db, user: CurrentUser, chapterId: string, input: { title: string; parentSectionId: string | null }) {
  const chapter = await requireChapter(db, user, chapterId, true);
  if (input.parentSectionId) {
    const parent = await repo.loadSection(db, input.parentSectionId);
    if (!parent || parent.chapterId !== chapterId) throw notFound("Parent section");
  }
  const position = await repo.nextSectionPosition(db, chapterId);
  const [row] = await db
    .insert(sections)
    .values({ playbookId: chapter.playbookId, chapterId, parentSectionId: input.parentSectionId, title: input.title, position })
    .returning();
  await repo.touchPlaybook(db, chapter.playbookId);
  return row!;
}

export async function updateSection(db: Db, user: CurrentUser, sectionId: string, patch: { title?: string; position?: number; chapterId?: string }) {
  const section = await requireSection(db, user, sectionId, true);
  if (patch.chapterId) {
    const target = await repo.loadChapter(db, patch.chapterId);
    if (!target || target.playbookId !== section.playbookId) throw notFound("Chapter");
  }
  const [row] = await db
    .update(sections)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.chapterId !== undefined ? { chapterId: patch.chapterId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sections.id, sectionId))
    .returning();
  await repo.touchPlaybook(db, section.playbookId);
  return row!;
}

export async function removeSection(db: Db, user: CurrentUser, sectionId: string): Promise<void> {
  const section = await requireSection(db, user, sectionId, true);
  await db.delete(sections).where(eq(sections.id, sectionId));
  const siblings = (await repo.listSections(db, section.playbookId)).filter((s) => s.chapterId === section.chapterId);
  await repo.reorderSections(db, section.chapterId, siblings.map((s) => s.id));
  await repo.touchPlaybook(db, section.playbookId);
}

export async function reorderSections(db: Db, user: CurrentUser, chapterId: string, orderedIds: string[]): Promise<void> {
  await requireChapter(db, user, chapterId, true);
  await repo.reorderSections(db, chapterId, orderedIds);
}

// ---- Content and versions --------------------------------------------------

export async function getSection(db: Db, user: CurrentUser, sectionId: string): Promise<SectionDetail> {
  const section = await requireSection(db, user, sectionId, false);
  return toSectionDetail(section);
}

/**
 * Saves section content and snapshots the previous text. `baseSavedAt` is the timestamp the edit was
 * based on; if the stored content has moved on since, the save is rejected rather than silently
 * overwriting a collaborator.
 */
export async function saveSectionContent(
  db: Db,
  user: CurrentUser,
  sectionId: string,
  input: { contentMd: string; baseSavedAt: string | null; reason: "edit" | "regenerate" | "assistant" | "insert" | "restore" },
): Promise<SectionDetail> {
  const section = await requireSection(db, user, sectionId, true);
  const storedAt = section.contentSavedAt?.toISOString() ?? null;
  if (storedAt && input.baseSavedAt !== storedAt) {
    throw conflict("This section changed since you started editing. Reload to see the latest version.");
  }
  if (section.contentMd === input.contentMd) return toSectionDetail(section);

  // Snapshot what is being replaced, so the history reads as "what it was before this save".
  if (section.contentMd.trim()) {
    await repo.insertVersion(db, { sectionId, contentMd: section.contentMd, reason: input.reason, createdBy: user.id });
  }
  const [row] = await db
    .update(sections)
    .set({ contentMd: input.contentMd, wordCount: countWords(input.contentMd), contentSavedAt: new Date(), updatedAt: new Date() })
    .where(eq(sections.id, sectionId))
    .returning();
  await repo.touchPlaybook(db, section.playbookId);
  return toSectionDetail(row!);
}

/** Writes content on behalf of a background job (no user, no conflict check). */
export async function writeGeneratedContent(db: Db, sectionId: string, contentMd: string, reason: "regenerate" | "edit"): Promise<void> {
  const section = await repo.loadSection(db, sectionId);
  if (!section) throw notFound("Section");
  if (section.contentMd.trim()) {
    await repo.insertVersion(db, { sectionId, contentMd: section.contentMd, reason, createdBy: null });
  }
  await db
    .update(sections)
    .set({ contentMd, wordCount: countWords(contentMd), contentSavedAt: new Date(), updatedAt: new Date() })
    .where(eq(sections.id, sectionId));
}

export async function listSectionVersions(db: Db, user: CurrentUser, sectionId: string) {
  await requireSection(db, user, sectionId, false);
  const rows = await repo.listVersions(db, sectionId);
  return rows.map((v) => ({
    id: v.id,
    reason: v.reason,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy,
    wordCount: countWords(v.contentMd),
  }));
}

export async function getVersionContent(db: Db, user: CurrentUser, sectionId: string, versionId: string): Promise<string> {
  await requireSection(db, user, sectionId, false);
  const version = await repo.getVersion(db, versionId);
  if (!version || version.sectionId !== sectionId) throw notFound("Version");
  return version.contentMd;
}

export async function restoreSectionVersion(db: Db, user: CurrentUser, sectionId: string, versionId: string): Promise<SectionDetail> {
  const section = await requireSection(db, user, sectionId, true);
  const version = await repo.getVersion(db, versionId);
  if (!version || version.sectionId !== sectionId) throw notFound("Version");
  return saveSectionContent(db, user, sectionId, {
    contentMd: version.contentMd,
    baseSavedAt: section.contentSavedAt?.toISOString() ?? null,
    reason: "restore",
  });
}

/**
 * Every section's body for one playbook. Used while a draft job runs so the editor can show each
 * section the moment it is written, rather than blocking until the whole playbook is finished.
 */
export async function listSectionContents(db: Db, user: CurrentUser, playbookId: string) {
  await requireReadablePlaybook(db, user, playbookId);
  const rows = await repo.listSections(db, playbookId);
  return rows.map((r) => ({
    id: r.id,
    contentMd: r.contentMd,
    wordCount: r.wordCount,
    contentSavedAt: r.contentSavedAt?.toISOString() ?? null,
  }));
}
