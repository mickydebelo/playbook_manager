import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers, knowledgeSources, sourceChunks } from "@/server/db/schema";
import { chunksForSources, searchChunksByText, searchChunksByVector, topChunksForSection } from "@/server/modules/knowledge/repository";
import { createTestContext, destroyTestContext, type TestContext } from "../helpers/db";

let ctx: TestContext;
let sourceA: string;
let sourceB: string;

/** A deterministic unit vector, so cosine distance in the assertions is exact rather than approximate. */
function unitVector(axis: number): number[] {
  const v = new Array(1024).fill(0);
  v[axis] = 1;
  return v;
}

const AUDIT_AXIS = 7;
const INTRO_AXIS = 12;

beforeAll(async () => {
  ctx = await createTestContext();
  const rows = await ctx.db
    .insert(knowledgeSources)
    .values([
      { type: "pdf", title: "Long handbook", subtitle: "", ownerOrg: "TA", year: 2026, pageCount: 90, status: "approved", currency: "current", tags: [] },
      { type: "docx", title: "Short note", subtitle: "", ownerOrg: "TA", year: 2026, pageCount: 3, status: "approved", currency: "current", tags: [] },
    ])
    .returning();
  sourceA = rows[0]!.id;
  sourceB = rows[1]!.id;

  // The on-topic passage is deliberately LAST in the handbook: position-ordered retrieval,
  // which is what the code did before, would miss it entirely.
  await ctx.db.insert(sourceChunks).values([
    { sourceId: sourceA, position: 0, pageNo: 1, text: "Front matter and acknowledgements.", embedding: unitVector(INTRO_AXIS) },
    { sourceId: sourceA, position: 1, pageNo: 2, text: "Table of contents.", embedding: unitVector(INTRO_AXIS) },
    { sourceId: sourceA, position: 2, pageNo: 3, text: "About the authors.", embedding: unitVector(INTRO_AXIS) },
    { sourceId: sourceA, position: 3, pageNo: 4, text: "Another preamble page.", embedding: unitVector(INTRO_AXIS) },
    { sourceId: sourceA, position: 4, pageNo: 61, text: "Audit trails must record who changed a document and when.", embedding: unitVector(AUDIT_AXIS) },
    { sourceId: sourceB, position: 0, pageNo: 1, text: "A short note about audit logging.", embedding: unitVector(AUDIT_AXIS) },
  ]);
});
afterAll(async () => destroyTestContext(ctx));

describe("topChunksForSection", () => {
  it("returns the passage that matches the topic, not the first page of the document", async () => {
    const hits = await topChunksForSection(ctx.db, { sourceIds: [sourceA], embedding: unitVector(AUDIT_AXIS), perSource: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toContain("Audit trails must record");
    expect(hits[0]!.pageNo).toBe(61);
    expect(hits[0]!.distance).toBeLessThan(0.01);
  });

  it("carries page provenance so a draft can cite precisely", async () => {
    const hits = await topChunksForSection(ctx.db, { sourceIds: [sourceA, sourceB], embedding: unitVector(AUDIT_AXIS), perSource: 1 });
    expect(hits.map((h) => h.pageNo).sort()).toEqual([1, 61]);
    expect(hits.every((h) => h.chunkId && h.sourceId)).toBe(true);
  });

  it("caps how much one source can contribute so a long document cannot crowd out the others", async () => {
    const hits = await topChunksForSection(ctx.db, { sourceIds: [sourceA, sourceB], embedding: unitVector(INTRO_AXIS), perSource: 2 });
    const fromA = hits.filter((h) => h.sourceId === sourceA);
    expect(fromA.length).toBeLessThanOrEqual(2);
  });

  it("honours the overall budget and orders globally by distance", async () => {
    const hits = await topChunksForSection(ctx.db, { sourceIds: [sourceA, sourceB], embedding: unitVector(AUDIT_AXIS), perSource: 3, total: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0]!.distance).toBeLessThanOrEqual(hits[1]!.distance);
    expect(hits[0]!.distance).toBeLessThan(0.01); // an on-topic passage sorts first
  });

  it("returns nothing for an empty selection rather than querying", async () => {
    expect(await topChunksForSection(ctx.db, { sourceIds: [], embedding: unitVector(AUDIT_AXIS) })).toEqual([]);
  });

  it("ignores chunks that have no embedding yet", async () => {
    const [pending] = await ctx.db
      .insert(knowledgeSources)
      .values({ type: "pdf", title: "Still indexing", subtitle: "", ownerOrg: "TA", year: 2026, pageCount: 1, status: "approved", currency: "current", tags: [] })
      .returning();
    await ctx.db.insert(sourceChunks).values({ sourceId: pending!.id, position: 0, text: "Audit trails, not yet embedded.", embedding: null });
    const hits = await topChunksForSection(ctx.db, { sourceIds: [pending!.id], embedding: unitVector(AUDIT_AXIS) });
    expect(hits).toEqual([]);
  });
});

describe("chunksForSources fallback", () => {
  it("limits per source in SQL rather than after the fact", async () => {
    const map = await chunksForSources(ctx.db, [sourceA, sourceB], 2);
    expect(map.get(sourceA)).toHaveLength(2);
    expect(map.get(sourceB)).toHaveLength(1);
    // position order, so the opening pages — this is the no-embeddings fallback
    expect(map.get(sourceA)![0]).toContain("Front matter");
  });

  it("returns an empty map for no sources", async () => {
    expect((await chunksForSources(ctx.db, [])).size).toBe(0);
  });
});

/**
 * The confidentiality boundary. These assertions are the reason the customer filter lives in SQL:
 * every retrieval path must be unable to cross it, whether or not any UI remembers to ask.
 */
describe("customer-scoped retrieval", () => {
  let customerA: string;
  let customerB: string;
  let docOfA: string;
  let shared: string;

  beforeAll(async () => {
    const rows = await ctx.db
      .insert(customers)
      .values([
        { name: "Customer A", industry: "aeco", sizeBand: "large" },
        { name: "Customer B", industry: "aeco", sizeBand: "large" },
      ])
      .returning();
    customerA = rows[0]!.id;
    customerB = rows[1]!.id;

    const sources = await ctx.db
      .insert(knowledgeSources)
      .values([
        { type: "docx", title: "A's internal audit policy", ownerOrg: "A", status: "approved", currency: "current", customerId: customerA, tags: [] },
        { type: "docx", title: "Shared audit guidance", ownerOrg: "TA", status: "approved", currency: "current", tags: [] },
      ])
      .returning();
    docOfA = sources[0]!.id;
    shared = sources[1]!.id;

    await ctx.db.insert(sourceChunks).values([
      { sourceId: docOfA, position: 0, pageNo: 1, text: "Audit trails at Customer A are reviewed monthly.", embedding: unitVector(AUDIT_AXIS) },
      { sourceId: shared, position: 0, pageNo: 1, text: "Audit trails should be reviewed regularly.", embedding: unitVector(AUDIT_AXIS) },
    ]);
  });

  it("proposes a customer's own document for that customer", async () => {
    const ids = (await searchChunksByVector(ctx.db, unitVector(AUDIT_AXIS), customerA)).map((h) => h.sourceId);
    expect(ids).toContain(docOfA);
  });

  it("never proposes one customer's document for another", async () => {
    const ids = (await searchChunksByVector(ctx.db, unitVector(AUDIT_AXIS), customerB)).map((h) => h.sourceId);
    expect(ids).not.toContain(docOfA);
    expect(ids).toContain(shared); // the shared library is still available to everyone
  });

  it("applies the same boundary on the keyword fallback", async () => {
    const forB = (await searchChunksByText(ctx.db, ["audit"], customerB)).map((h) => h.sourceId);
    expect(forB).not.toContain(docOfA);
    expect(forB).toContain(shared);
    const forA = (await searchChunksByText(ctx.db, ["audit"], customerA)).map((h) => h.sourceId);
    expect(forA).toContain(docOfA);
  });

  it("returns only shared sources when there is no customer in scope", async () => {
    const ids = (await searchChunksByVector(ctx.db, unitVector(AUDIT_AXIS), null)).map((h) => h.sourceId);
    expect(ids).not.toContain(docOfA);
    expect(ids).toContain(shared);
  });
});
