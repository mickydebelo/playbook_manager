import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { knowledgeSources, sectionSources, sourceChunks } from "@/server/db/schema";
import { createPlaybook } from "@/server/modules/playbooks/service";
import { addChapter, addSection, getSection } from "@/server/modules/sections/service";
import { listLibrary, listSectionCandidates, setSectionSourceSelection } from "@/server/modules/knowledge/service";
import { replaceCandidates, searchChunksByText } from "@/server/modules/knowledge/repository";
import { createTestContext, destroyTestContext, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
let sectionId: string;
let approvedId: string;
let draftId: string;
let olderId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Knowledge Co" });
  const chapter = await addChapter(ctx.db, ctx.author, pb.id, { title: "Chapter" });
  sectionId = (await addSection(ctx.db, ctx.author, chapter.id, { title: "Docs workflow", parentSectionId: null })).id;

  const rows = await ctx.db
    .insert(knowledgeSources)
    .values([
      { type: "pdf", title: "Approved current guide", subtitle: "s", ownerOrg: "Technical Advisory", year: 2026, pageCount: 40, status: "approved", currency: "current", tags: ["cde"] },
      { type: "docx", title: "Unreviewed upload", subtitle: "s", ownerOrg: "Field", year: 2026, pageCount: 4, status: "draft", currency: "current", tags: [] },
      { type: "link", title: "Older external note", subtitle: "s", ownerOrg: "External source", year: 2019, pageCount: 1, status: "approved", currency: "older", isExternal: true, tags: [] },
    ])
    .returning();
  [approvedId, draftId, olderId] = [rows[0]!.id, rows[1]!.id, rows[2]!.id];
  await ctx.db.insert(sourceChunks).values([
    { sourceId: approvedId, position: 0, text: "Document control covers naming, versioning and approval workflows." },
    { sourceId: draftId, position: 0, text: "An unreviewed note about naming." },
    { sourceId: olderId, position: 0, text: "Superseded guidance on versioning." },
  ]);
});
afterAll(async () => destroyTestContext(ctx));

describe("library listing", () => {
  it("returns every active source with derived fields", async () => {
    const all = await listLibrary(ctx.db, { filter: "all" });
    expect(all.map((s) => s.title).sort()).toEqual(["Approved current guide", "Older external note", "Unreviewed upload"]);
  });

  it("filters by approved, current and external", async () => {
    expect((await listLibrary(ctx.db, { filter: "approved" })).every((s) => s.status === "approved")).toBe(true);
    expect((await listLibrary(ctx.db, { filter: "current" })).every((s) => s.currency === "current")).toBe(true);
    const external = await listLibrary(ctx.db, { filter: "external" });
    expect(external.map((s) => s.title)).toEqual(["Older external note"]);
  });

  it("searches title and owner, case-insensitively", async () => {
    expect((await listLibrary(ctx.db, { q: "APPROVED" })).map((s) => s.title)).toEqual(["Approved current guide"]);
    expect((await listLibrary(ctx.db, { q: "external source" })).map((s) => s.title)).toEqual(["Older external note"]);
    expect(await listLibrary(ctx.db, { q: "nothing matches this" })).toEqual([]);
  });

  it("hides archived sources", async () => {
    await ctx.db.update(knowledgeSources).set({ archivedAt: new Date() }).where(eq(knowledgeSources.id, draftId));
    expect((await listLibrary(ctx.db, {})).map((s) => s.title)).not.toContain("Unreviewed upload");
    await ctx.db.update(knowledgeSources).set({ archivedAt: null }).where(eq(knowledgeSources.id, draftId));
  });
});

describe("keyword retrieval fallback", () => {
  it("only matches approved, non-archived sources", async () => {
    const hits = await searchChunksByText(ctx.db, ["naming"], null);
    const ids = hits.map((h) => h.sourceId);
    expect(ids).toContain(approvedId);
    expect(ids).not.toContain(draftId); // unreviewed content must never be proposed by default
  });

  it("includes unapproved (but not archived) sources when asked, for step 2 proposals", async () => {
    const ids = (await searchChunksByText(ctx.db, ["naming"], null, 40, { includeUnapproved: true })).map((h) => h.sourceId);
    expect(ids).toContain(approvedId);
    expect(ids).toContain(draftId); // a relevant upload is offered for the consultant to review and pick

    await ctx.db.update(knowledgeSources).set({ archivedAt: new Date() }).where(eq(knowledgeSources.id, draftId));
    const afterArchive = (await searchChunksByText(ctx.db, ["naming"], null, 40, { includeUnapproved: true })).map((h) => h.sourceId);
    expect(afterArchive).not.toContain(draftId); // archived stays out either way
    await ctx.db.update(knowledgeSources).set({ archivedAt: null }).where(eq(knowledgeSources.id, draftId));
  });
});

describe("section candidates and selection", () => {
  it("lists what a retrieval run proposed, with relevance and reason", async () => {
    await replaceCandidates(ctx.db, sectionId, [
      { sourceId: approvedId, relevance: "high", score: 0.71, relevantFor: "Naming and versioning" },
      { sourceId: olderId, relevance: "low", score: 0.2, relevantFor: "Superseded guidance" },
    ]);
    const list = await listSectionCandidates(ctx.db, ctx.author, sectionId, {});
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.id === approvedId)).toMatchObject({ relevance: "high", relevantFor: "Naming and versioning", selected: false });
  });

  it("filters candidates by search text and the approved-only toggle", async () => {
    await replaceCandidates(ctx.db, sectionId, [
      { sourceId: approvedId, relevance: "high", score: 0.7, relevantFor: "x" },
      { sourceId: draftId, relevance: "medium", score: 0.4, relevantFor: "y" },
    ]);
    expect((await listSectionCandidates(ctx.db, ctx.author, sectionId, { approvedOnly: true })).map((c) => c.id)).toEqual([approvedId]);
    expect((await listSectionCandidates(ctx.db, ctx.author, sectionId, { q: "unreviewed" })).map((c) => c.id)).toEqual([draftId]);
  });

  it("selecting a source updates coverage, and deselecting reverses it", async () => {
    expect((await getSection(ctx.db, ctx.author, sectionId)).coverage).toBe("none");
    await setSectionSourceSelection(ctx.db, ctx.author, sectionId, approvedId, true);
    expect((await getSection(ctx.db, ctx.author, sectionId)).coverage).toBe("thin");
    await setSectionSourceSelection(ctx.db, ctx.author, sectionId, draftId, true);
    expect((await getSection(ctx.db, ctx.author, sectionId)).coverage).toBe("ok");
    await setSectionSourceSelection(ctx.db, ctx.author, sectionId, draftId, false);
    expect((await getSection(ctx.db, ctx.author, sectionId)).coverage).toBe("thin");
  });

  it("keeps a selected source even when a later retrieval run would not propose it", async () => {
    await setSectionSourceSelection(ctx.db, ctx.author, sectionId, approvedId, true);
    await replaceCandidates(ctx.db, sectionId, [{ sourceId: olderId, relevance: "medium", score: 0.5, relevantFor: "new match" }]);
    const list = await listSectionCandidates(ctx.db, ctx.author, sectionId, {});
    const kept = list.find((c) => c.id === approvedId);
    expect(kept?.selected).toBe(true);
    expect(list.map((c) => c.id).sort()).toEqual([approvedId, olderId].sort());
  });

  it("refuses selection changes from someone without edit access, and 404s on an unknown source", async () => {
    await expect(setSectionSourceSelection(ctx.db, ctx.outsider, sectionId, approvedId, true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      setSectionSourceSelection(ctx.db, ctx.author, sectionId, "00000000-0000-4000-8000-0000000000bb", true),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports the selected-source count on the playbook outline", async () => {
    const { getPlaybook } = await import("@/server/modules/playbooks/service");
    const { sections } = await import("@/server/db/schema");
    const [row] = await ctx.db.select().from(sections).where(eq(sections.id, sectionId));
    const detail = await getPlaybook(ctx.db, ctx.author, row!.playbookId);
    const outlineSection = detail.outline.flatMap((c) => c.sections).find((x) => x.id === sectionId);
    // guards the same class of bug as usedIn: a count that silently returns zero
    expect(outlineSection?.sourceCount).toBeGreaterThan(0);
    expect(outlineSection?.coverage).not.toBe("none");
  });

  it("counts a source as used once per playbook that selects it", async () => {
    const rows = await ctx.db.select().from(sectionSources).where(eq(sectionSources.sectionId, sectionId));
    expect(rows.some((r) => r.selected)).toBe(true);
    const lib = await listLibrary(ctx.db, {});
    expect(lib.find((s) => s.id === approvedId)!.usedIn).toBe(1);
  });
});
