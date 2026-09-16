import { eq } from "drizzle-orm";
import { embedMany, isAiConfigured } from "../../../ai/aps-client";
import { knowledgeSources, sourceChunks, sourcePages } from "../../../db/schema";
import { chunkPages } from "../../ingest/chunk";
import { parseImportBuffer } from "../../ingest/parse";
import { readAsset } from "../../storage";
import type { JobContext } from "../worker";

/** Chunks embedded per gateway call. Matches the seed backfill so throttling behaves the same. */
const EMBED_BATCH = 32;

/**
 * Turns a stored document into retrievable knowledge: parse, chunk, embed, and record the pages.
 *
 * The source row already exists as a `draft` so the library can show it as "Indexing" from the
 * moment it was accepted. This job fills in the text and, only when that succeeded, stamps
 * `indexed_at`. Approval stays a human decision — the approved-only retrieval filter means an
 * un-reviewed document cannot reach a customer deliverable even once it is indexed.
 */
export async function ingestSourceHandler({ db, job, payload, progress }: JobContext): Promise<Record<string, unknown>> {
  const sourceId = job.targetId;
  const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId)).limit(1);
  if (!source) throw new Error("Knowledge source not found");

  const assetId = typeof payload.assetId === "string" ? payload.assetId : source.originalAssetId;
  if (!assetId) throw new Error("This source has no stored original to index");

  await progress({ done: 0, total: 4, label: "Reading the file" });
  const asset = await readAsset(db, assetId);

  await progress({ done: 1, total: 4, label: "Extracting the text" });
  const parsed = parseImportBuffer(asset.data, asset.fileName);
  if (parsed.error) throw new Error(parsed.error);

  // Re-indexing replaces the previous text rather than accumulating a second copy of it.
  await db.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
  await db.delete(sourcePages).where(eq(sourcePages.sourceId, sourceId));

  const lead = [parsed.title ?? source.title, source.subtitle].filter((p) => p && p.trim()).join(". ");
  const chunks = chunkPages(parsed.pages, lead);
  if (!chunks.length) throw new Error("No readable text was found in this document");

  await progress({ done: 2, total: 4, label: `Indexing ${chunks.length} passages` });
  const inserted = await db
    .insert(sourceChunks)
    .values(chunks.map((c) => ({ sourceId, position: c.position, pageNo: c.pageNo, text: c.text })))
    .returning({ id: sourceChunks.id, text: sourceChunks.text });

  // One row per real page, so a page citation has something to point at and page previews have
  // somewhere to hang later.
  const pageNumbers = [...new Set(parsed.pages.map((p) => p.pageNo).filter((n): n is number => typeof n === "number"))].sort((a, b) => a - b);
  if (pageNumbers.length) {
    await db.insert(sourcePages).values(pageNumbers.map((pageNo) => ({ sourceId, pageNo })));
  }

  let embedded = 0;
  if (isAiConfigured()) {
    await progress({ done: 3, total: 4, label: "Building the search index" });
    for (let i = 0; i < inserted.length; i += EMBED_BATCH) {
      const batch = inserted.slice(i, i + EMBED_BATCH);
      const vectors = await embedMany(batch.map((c) => c.text));
      for (const [n, row] of batch.entries()) {
        await db.update(sourceChunks).set({ embedding: vectors[n]! }).where(eq(sourceChunks.id, row.id));
      }
      embedded += batch.length;
      await progress({ done: 3, total: 4, label: `Building the search index (${embedded}/${inserted.length})` });
    }
  }

  await db
    .update(knowledgeSources)
    .set({
      pageCount: parsed.pageCount ?? pageNumbers.length ?? null,
      // A better title from the document's own metadata beats one derived from the filename.
      title: parsed.title?.trim() ? parsed.title.trim().slice(0, 200) : source.title,
      indexedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSources.id, sourceId));

  await progress({ done: 4, total: 4, label: "Done" });
  return {
    sourceId,
    fileType: parsed.fileType,
    pages: parsed.pages.length,
    chunks: inserted.length,
    embedded,
    // Said plainly in the result so the UI can explain why a source is not yet retrievable.
    retrievable: false,
  };
}
