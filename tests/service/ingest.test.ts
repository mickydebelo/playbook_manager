import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customers, knowledgeSources, sourceChunks, sourcePages } from "@/server/db/schema";
import { searchChunksByText } from "@/server/modules/knowledge/repository";
import { ingestUpload, reindexSource } from "@/server/modules/ingest/service";
import { drainJobs } from "@/server/modules/jobs";
import { setStorageDriverForTests } from "@/server/modules/storage";
import { createTestContext, destroyTestContext, type TestContext } from "../helpers/db";
import { docxFixture, memoryStorage, pdfFixture, pptxFixture } from "../helpers/documents";

let ctx: TestContext;
let customerA: string;
let customerB: string;
const storage = memoryStorage();

/** The whole ingest path, with files in memory and no AI gateway, so embedding is skipped. */
beforeAll(async () => {
  ctx = await createTestContext();
  setStorageDriverForTests(storage.driver);
  const rows = await ctx.db
    .insert(customers)
    .values([
      { name: "Ingest Customer A", industry: "aeco", sizeBand: "large" },
      { name: "Ingest Customer B", industry: "aeco", sizeBand: "large" },
    ])
    .returning();
  customerA = rows[0]!.id;
  customerB = rows[1]!.id;
});
afterAll(async () => {
  setStorageDriverForTests(null);
  await destroyTestContext(ctx);
});
beforeEach(() => storage.files.clear());

const chunksOf = (sourceId: string) =>
  ctx.db.select().from(sourceChunks).where(eq(sourceChunks.sourceId, sourceId)).orderBy(sourceChunks.position);

describe("ingesting a PDF", () => {
  it("indexes every page and keeps the page number on each passage", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "iso-19650-guide.pdf",
      data: pdfFixture([
        "Document control begins with a naming convention agreed by every party before work starts.",
        "Audit trails record who changed a controlled document, when, and against which revision.",
      ]),
      customerId: null,
    });
    await drainJobs(ctx.db);

    const [source] = await ctx.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, started.sourceId));
    expect(source!.type).toBe("pdf");
    expect(source!.title).toBe("Iso 19650 guide");
    expect(source!.indexedAt).not.toBeNull();
    expect(source!.pageCount).toBe(2);

    const chunks = await chunksOf(started.sourceId);
    // The lead chunk carries the title, then one passage per page with its real page number.
    expect(chunks[0]!.pageNo).toBeNull();
    expect(chunks.map((c) => c.pageNo).filter(Boolean)).toEqual([1, 2]);
    expect(chunks.find((c) => c.pageNo === 2)!.text).toContain("Audit trails record");

    const pages = await ctx.db.select().from(sourcePages).where(eq(sourcePages.sourceId, started.sourceId));
    expect(pages.map((p) => p.pageNo).sort()).toEqual([1, 2]);
  });

  it("stores the original file so it can be re-indexed later", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "reindex-me.pdf",
      data: pdfFixture(["Change management needs a single owner for every decision that is taken."]),
      customerId: null,
    });
    await drainJobs(ctx.db);
    expect([...storage.files.keys()].some((k) => k.startsWith("sources/"))).toBe(true);

    const before = (await chunksOf(started.sourceId)).length;
    await reindexSource(ctx.db, ctx.admin, started.sourceId);
    await drainJobs(ctx.db);
    // Re-indexing replaces the passages instead of adding a second copy of them.
    expect((await chunksOf(started.sourceId)).length).toBe(before);
  });
});

describe("ingesting Word and PowerPoint", () => {
  it("keeps Word passages under their heading, with no invented page numbers", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "document-control-handbook.docx",
      data: docxFixture([
        { text: "Document control handbook", style: "Title" },
        { text: "Naming conventions", style: "Heading1" },
        { text: "Every controlled file carries a project code, an originator and a revision number.", style: undefined },
      ]),
      customerId: null,
    });
    await drainJobs(ctx.db);

    const chunks = await chunksOf(started.sourceId);
    expect(chunks.every((c) => c.pageNo === null)).toBe(true);
    expect(chunks.some((c) => c.text.includes("Naming conventions") && c.text.includes("project code"))).toBe(true);
  });

  it("numbers PowerPoint passages by slide", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "rollout-plan.pptx",
      data: pptxFixture([
        ["Rollout plan", "Three regions in the first wave of the programme"],
        ["Risks", "Change fatigue is the main risk to the adoption schedule"],
      ]),
      customerId: null,
    });
    await drainJobs(ctx.db);
    const chunks = await chunksOf(started.sourceId);
    expect(chunks.map((c) => c.pageNo).filter(Boolean)).toEqual([1, 2]);
  });
});

describe("customer tagging", () => {
  it("tags the source and keeps it out of another customer's retrieval", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "customer-a-standard.pdf",
      data: pdfFixture(["Customer A requires a monthly audit of every controlled document register."]),
      customerId: customerA,
      tags: ["Customer standard"],
    });
    await drainJobs(ctx.db);

    const [source] = await ctx.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, started.sourceId));
    expect(source!.customerId).toBe(customerA);
    expect(source!.tags).toContain("Customer standard");

    // Approve it, because retrieval only ever considers approved sources.
    await ctx.db.update(knowledgeSources).set({ status: "approved" }).where(eq(knowledgeSources.id, started.sourceId));
    expect((await searchChunksByText(ctx.db, ["audit"], customerA)).map((h) => h.sourceId)).toContain(started.sourceId);
    expect((await searchChunksByText(ctx.db, ["audit"], customerB)).map((h) => h.sourceId)).not.toContain(started.sourceId);
  });

  it("rejects a customer that does not exist, rather than hiding the document from everyone", async () => {
    await expect(
      ingestUpload(ctx.db, ctx.admin, {
        fileName: "orphan.pdf",
        data: pdfFixture(["Text that would never be retrievable."]),
        customerId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow(/customer does not exist/i);
  });
});

describe("what ingest refuses", () => {
  it("lands as a draft, so nothing un-reviewed is retrievable", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "unreviewed.pdf",
      data: pdfFixture(["Naming conventions must be agreed before the project starts."]),
      customerId: null,
    });
    await drainJobs(ctx.db);
    const [source] = await ctx.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, started.sourceId));
    expect(source!.status).toBe("draft");
    expect((await searchChunksByText(ctx.db, ["naming"], null)).map((h) => h.sourceId)).not.toContain(started.sourceId);
  });

  it("refuses a file type it cannot parse, before storing anything", async () => {
    await expect(
      ingestUpload(ctx.db, ctx.admin, { fileName: "notes.txt", data: Buffer.from("plain text"), customerId: null }),
    ).rejects.toThrow(/PDF, Word/);
    expect(storage.files.size).toBe(0);
  });

  it("refuses an empty file", async () => {
    await expect(ingestUpload(ctx.db, ctx.admin, { fileName: "empty.pdf", data: Buffer.alloc(0), customerId: null })).rejects.toThrow(/empty/i);
  });

  it("only lets a curator add to the shared library", async () => {
    await expect(
      ingestUpload(ctx.db, ctx.author, { fileName: "shared.pdf", data: pdfFixture(["Anything at all."]), customerId: null }),
    ).rejects.toThrow(/curator/i);
    // The same author may bring in a document for the customer they are working with.
    const started = await ingestUpload(ctx.db, ctx.author, {
      fileName: "their-customer.pdf",
      data: pdfFixture(["Customer specific guidance about document approval routes."]),
      customerId: customerA,
    });
    expect(started.sourceId).toBeTruthy();
  });

  it("leaves a source un-indexed and reports why when the file has no text", async () => {
    const started = await ingestUpload(ctx.db, ctx.admin, {
      fileName: "scanned.pdf",
      data: Buffer.from("%PDF-1.4\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"),
      customerId: null,
    });
    await drainJobs(ctx.db);
    const [source] = await ctx.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, started.sourceId));
    // Visible in the library as a draft that never finished indexing, not silently discarded.
    expect(source!.indexedAt).toBeNull();
    expect(await chunksOf(started.sourceId)).toEqual([]);
  });
});

describe("uploading the same document twice", () => {
  it("reuses the stored file instead of failing on its content hash", async () => {
    const data = pdfFixture(["Identical bytes uploaded by two different people on the same day."]);
    const first = await ingestUpload(ctx.db, ctx.admin, { fileName: "duplicate.pdf", data, customerId: null });
    // The storage key is the content hash, so the second upload hits the same key.
    const second = await ingestUpload(ctx.db, ctx.admin, { fileName: "duplicate.pdf", data, customerId: null });
    await drainJobs(ctx.db);
    expect(second.sourceId).not.toBe(first.sourceId); // two library entries, one stored file
    expect(storage.files.size).toBe(1);
  });
});
