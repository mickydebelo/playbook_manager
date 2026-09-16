import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chapters, sections, sectionVersions } from "@/server/db/schema";
import { createPlaybook } from "@/server/modules/playbooks/service";
import {
  addChapter, addSection, countWords, getSection, listSectionVersions, removeChapter, removeSection,
  restoreSectionVersion, saveSectionContent, updateChapter, updateSection,
} from "@/server/modules/sections/service";
import { coverageFor, recomputeCoverage } from "@/server/modules/sections/repository";
import { createTestContext, destroyTestContext, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
let playbookId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Sections Co" });
  playbookId = pb.id;
});
afterAll(async () => destroyTestContext(ctx));

describe("countWords", () => {
  it("ignores markdown markers", () => {
    expect(countWords("# Title\n\nOne two three.\n\n- a bullet\n- another")).toBe(7); // Title One two three a bullet another
    expect(countWords("")).toBe(0);
  });
});

describe("coverage", () => {
  it("maps selected-source counts to the outline dot", () => {
    expect(coverageFor(0)).toBe("none");
    expect(coverageFor(1)).toBe("thin");
    expect(coverageFor(2)).toBe("ok");
    expect(coverageFor(9)).toBe("ok");
  });
});

describe("outline editing", () => {
  it("appends chapters and sections in order", async () => {
    const c1 = await addChapter(ctx.db, ctx.author, playbookId, { title: "Vision" });
    const c2 = await addChapter(ctx.db, ctx.author, playbookId, { title: "Delivery" });
    expect([c1.position, c2.position]).toEqual([0, 1]);

    const s1 = await addSection(ctx.db, ctx.author, c1.id, { title: "Current state", parentSectionId: null });
    const s2 = await addSection(ctx.db, ctx.author, c1.id, { title: "Target state", parentSectionId: null });
    expect([s1.position, s2.position]).toEqual([0, 1]);
    expect(s1.playbookId).toBe(playbookId);
  });

  it("renames a chapter and a section", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Typo" });
    expect((await updateChapter(ctx.db, ctx.author, c.id, { title: "Fixed" })).title).toBe("Fixed");
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Old", parentSectionId: null });
    expect((await updateSection(ctx.db, ctx.author, s.id, { title: "New" })).title).toBe("New");
  });

  it("deleting a chapter removes its sections and renumbers the rest", async () => {
    const before = await ctx.db.select().from(chapters).where(eq(chapters.playbookId, playbookId));
    const doomed = await addChapter(ctx.db, ctx.author, playbookId, { title: "Doomed" });
    const child = await addSection(ctx.db, ctx.author, doomed.id, { title: "Child", parentSectionId: null });

    await removeChapter(ctx.db, ctx.author, doomed.id);
    expect(await ctx.db.select().from(sections).where(eq(sections.id, child.id))).toHaveLength(0);
    const after = await ctx.db.select().from(chapters).where(eq(chapters.playbookId, playbookId));
    expect(after).toHaveLength(before.length);
    expect(after.map((c) => c.position).sort((a, b) => a - b)).toEqual(after.map((_, i) => i));
  });

  it("deleting a section renumbers its siblings", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Renumber" });
    const a = await addSection(ctx.db, ctx.author, c.id, { title: "A", parentSectionId: null });
    await addSection(ctx.db, ctx.author, c.id, { title: "B", parentSectionId: null });
    const third = await addSection(ctx.db, ctx.author, c.id, { title: "C", parentSectionId: null });
    await removeSection(ctx.db, ctx.author, a.id);
    const rest = await ctx.db.select().from(sections).where(eq(sections.chapterId, c.id));
    expect(rest.map((r) => r.position).sort()).toEqual([0, 1]);
    expect(rest.find((r) => r.id === third.id)!.position).toBe(1);
  });

  it("refuses edits from someone without access", async () => {
    await expect(addChapter(ctx.db, ctx.outsider, playbookId, { title: "Nope" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("404s on an unknown chapter or section", async () => {
    const missing = "00000000-0000-4000-8000-0000000000aa";
    await expect(updateChapter(ctx.db, ctx.author, missing, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(getSection(ctx.db, ctx.author, missing)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("section content and versions", () => {
  it("saves content, counts words and stamps the save time", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Content" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });

    const saved = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "# Body\n\nFirst draft here.", baseSavedAt: null, reason: "edit" });
    expect(saved.wordCount).toBe(4); // Body First draft here
    expect(saved.contentSavedAt).not.toBeNull();
    // nothing to snapshot on a first save
    expect(await listSectionVersions(ctx.db, ctx.author, s.id)).toHaveLength(0);
  });

  it("snapshots the previous text on each subsequent save", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Versions" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    const v1 = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "one", baseSavedAt: null, reason: "edit" });
    const v2 = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "two", baseSavedAt: v1.contentSavedAt, reason: "edit" });
    await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "three", baseSavedAt: v2.contentSavedAt, reason: "edit" });

    const versions = await listSectionVersions(ctx.db, ctx.author, s.id);
    expect(versions).toHaveLength(2);
    const stored = await ctx.db.select().from(sectionVersions).where(eq(sectionVersions.sectionId, s.id));
    expect(stored.map((v) => v.contentMd).sort()).toEqual(["one", "two"]);
  });

  it("rejects a save based on stale content", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Conflict" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    const first = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "original", baseSavedAt: null, reason: "edit" });
    await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "collaborator wrote this", baseSavedAt: first.contentSavedAt, reason: "edit" });

    await expect(
      saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "my stale edit", baseSavedAt: first.contentSavedAt, reason: "edit" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("is a no-op when the text has not changed", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Idempotent" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    const a = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "same", baseSavedAt: null, reason: "edit" });
    const b = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "same", baseSavedAt: a.contentSavedAt, reason: "edit" });
    expect(b.contentSavedAt).toBe(a.contentSavedAt);
    expect(await listSectionVersions(ctx.db, ctx.author, s.id)).toHaveLength(0);
  });

  it("restores an earlier version as a new save", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Restore" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    const v1 = await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "the good version", baseSavedAt: null, reason: "edit" });
    await saveSectionContent(ctx.db, ctx.author, s.id, { contentMd: "a regrettable rewrite", baseSavedAt: v1.contentSavedAt, reason: "edit" });

    const [snapshot] = await listSectionVersions(ctx.db, ctx.author, s.id);
    const restored = await restoreSectionVersion(ctx.db, ctx.author, s.id, snapshot!.id);
    expect(restored.contentMd).toBe("the good version");
    expect((await getSection(ctx.db, ctx.author, s.id)).contentMd).toBe("the good version");
  });

  it("recomputes coverage from selected sources", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Coverage" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    await recomputeCoverage(ctx.db, playbookId);
    expect((await getSection(ctx.db, ctx.author, s.id)).coverage).toBe("none");
  });

  it("refuses content edits from a reader", async () => {
    const c = await addChapter(ctx.db, ctx.author, playbookId, { title: "Guarded" });
    const s = await addSection(ctx.db, ctx.author, c.id, { title: "Body", parentSectionId: null });
    await expect(
      saveSectionContent(ctx.db, ctx.outsider, s.id, { contentMd: "hack", baseSavedAt: null, reason: "edit" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
