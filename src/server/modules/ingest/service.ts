import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { customers, knowledgeSources } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { AppError } from "../../http/errors";
import { enqueueAndKick } from "../jobs";
import { storeAsset } from "../storage";
import { connectorFor } from "./connectors";
import { fileExceedsSizeLimit, ingestFileType, MAX_INGEST_FILE_SIZE_LABEL, MIME_FOR_TYPE, safeFileName, titleFromFileName } from "./file-types";
import type { IngestFileType } from "./types";

/**
 * Accepting documents into the knowledge library.
 *
 * A source row is created immediately as a `draft` with no `indexed_at`, so the library shows it
 * with an "Indexing" state the moment it is accepted. Only an approved source is retrievable, so
 * nothing half-parsed can reach a customer deliverable.
 */
export type IngestRequest = {
  fileName: string;
  data: Buffer;
  customerId: string | null;
  tags?: string[];
};

export type IngestStarted = { sourceId: string; jobId: string; title: string; fileType: IngestFileType };

/** A tag that does not resolve would quietly make the document invisible to every playbook. */
async function assertCustomerExists(db: Db, customerId: string): Promise<void> {
  const [row] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!row) throw new AppError("validation_failed", "That customer does not exist");
}

async function createPendingSource(
  db: Db,
  actor: CurrentUser,
  input: { fileName: string; fileType: IngestFileType; customerId: string | null; tags?: string[]; assetId: string; url?: string | null },
): Promise<{ id: string; title: string }> {
  const title = titleFromFileName(input.fileName);
  const [row] = await db
    .insert(knowledgeSources)
    .values({
      // The library's source type is the document format; `link` is for references with no file.
      type: input.fileType,
      title,
      ownerOrg: input.customerId ? "" : "Autodesk",
      status: "draft",
      currency: "current",
      isExternal: false,
      customerId: input.customerId,
      originalAssetId: input.assetId,
      url: input.url ?? null,
      tags: input.tags ?? [],
      uploadedBy: actor.id,
    })
    .returning({ id: knowledgeSources.id, title: knowledgeSources.title });
  return row!;
}

function validate(fileName: string, size: number): IngestFileType {
  const fileType = ingestFileType(fileName);
  if (!fileType) throw new AppError("validation_failed", "Only PDF, Word (.docx) and PowerPoint (.pptx) files can be ingested");
  if (size === 0) throw new AppError("validation_failed", "That file is empty");
  if (fileExceedsSizeLimit(size)) throw new AppError("validation_failed", `That file is larger than ${MAX_INGEST_FILE_SIZE_LABEL}`);
  return fileType;
}

/**
 * Anyone may bring in a document for the customer they are working with. Adding to the shared
 * library is curation: it becomes reusable knowledge for every playbook, so it needs a curator.
 */
function assertMayIngest(actor: CurrentUser, customerId: string | null): void {
  if (customerId) return;
  if (actor.role === "curator" || actor.role === "admin") return;
  throw new AppError("forbidden", "Only a curator can add a source to the shared library. Tag it to a customer instead.");
}

/** An uploaded file: stored first, then parsed by the job. */
export async function ingestUpload(db: Db, actor: CurrentUser, req: IngestRequest): Promise<IngestStarted> {
  const fileName = safeFileName(req.fileName);
  const fileType = validate(fileName, req.data.byteLength);
  assertMayIngest(actor, req.customerId);
  if (req.customerId) await assertCustomerExists(db, req.customerId);

  const asset = await storeAsset(db, {
    data: req.data,
    fileName,
    mimeType: MIME_FOR_TYPE[fileType],
    prefix: "sources",
    uploadedBy: actor.id,
  });
  const source = await createPendingSource(db, actor, { fileName, fileType, customerId: req.customerId, tags: req.tags, assetId: asset.id });

  const job = await enqueueAndKick(db, {
    type: "ingest_source",
    targetType: "knowledge_source",
    targetId: source.id,
    payload: { assetId: asset.id, fileName, fileType },
    createdBy: actor.id,
  });
  return { sourceId: source.id, jobId: job.id, title: source.title, fileType };
}

/**
 * A file from a connector. The bytes are fetched here rather than in the job so a bad id or an
 * unreachable folder is reported to the caller instead of failing asynchronously.
 */
export async function ingestFromConnector(
  db: Db,
  actor: CurrentUser,
  input: { connector: "local_folder" | "sharepoint"; fileId: string; customerId: string | null; tags?: string[] },
): Promise<IngestStarted> {
  const connector = connectorFor(input.connector);
  // The id is resolved by the connector against its own configured root; it is never a path from
  // the request used directly in a filesystem call.
  const listed = (await connector.list()).find((f) => f.id === input.fileId);
  if (!listed) throw new AppError("not_found", "That file is no longer in the watched folder");

  const data = await connector.fetch(listed.id);
  return ingestUpload(db, actor, { fileName: listed.fileName, data, customerId: input.customerId, tags: input.tags });
}

/**
 * Review decision on a library source. Curation is the gate between "ingested" and "usable":
 * retrieval only ever considers approved sources, so this is what makes a document retrievable.
 */
export async function setSourceStatus(
  db: Db,
  actor: CurrentUser,
  sourceId: string,
  status: "draft" | "approved" | "archived",
): Promise<{ id: string; status: string }> {
  if (actor.role !== "curator" && actor.role !== "admin") {
    throw new AppError("forbidden", "Only a curator can approve or archive a library source");
  }
  const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId)).limit(1);
  if (!row) throw new AppError("not_found", "Source not found");
  if (status === "approved" && row.indexedAt === null) {
    throw new AppError("conflict", "This source is still being indexed. Approve it once indexing has finished.");
  }
  const [updated] = await db
    .update(knowledgeSources)
    .set({ status, archivedAt: status === "archived" ? new Date() : null, updatedAt: new Date() })
    .where(eq(knowledgeSources.id, sourceId))
    .returning({ id: knowledgeSources.id, status: knowledgeSources.status });
  return updated!;
}

export async function reindexSource(db: Db, actor: CurrentUser, sourceId: string): Promise<{ jobId: string }> {
  const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId)).limit(1);
  if (!row) throw new AppError("not_found", "Source not found");
  if (!row.originalAssetId) throw new AppError("validation_failed", "This source has no stored original to re-index");
  const curates = actor.role === "curator" || actor.role === "admin";
  if (!curates && row.uploadedBy !== actor.id) throw new AppError("forbidden", "Only a curator can re-index a source someone else uploaded");
  const job = await enqueueAndKick(db, {
    type: "ingest_source",
    targetType: "knowledge_source",
    targetId: sourceId,
    payload: { assetId: row.originalAssetId, reindex: true },
    createdBy: actor.id,
  });
  return { jobId: job.id };
}
