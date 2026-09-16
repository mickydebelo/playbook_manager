import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { MAX_INGEST_FILE_SIZE, MAX_INGEST_FILE_SIZE_LABEL } from "@/server/modules/ingest/file-types";
import { ingestUpload } from "@/server/modules/ingest/service";

/** Multipart fields, validated before anything touches storage or the parser. */
const fieldsSchema = z.object({
  customerId: z.string().uuid().nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

/**
 * Uploads a document into the knowledge library.
 *
 * Multipart, so the route reads the form itself rather than using the wrapper's JSON body parser.
 * The filename is treated as untrusted: it is sanitised in the service before it is used to build
 * a storage key, and the file type comes from the extension allow-list, never from the client's
 * declared MIME type.
 */
export const POST = defineRoute({}, async ({ db, user, req }) => {
  const form = await req.formData().catch(() => {
    throw new AppError("validation_failed", "Send the file as multipart/form-data");
  });

  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("validation_failed", "No file was attached");
  if (file.size > MAX_INGEST_FILE_SIZE) throw new AppError("validation_failed", `That file is larger than ${MAX_INGEST_FILE_SIZE_LABEL}`);

  const rawTags = form.get("tags");
  const fields = fieldsSchema.parse({
    customerId: (form.get("customerId") as string | null)?.trim() || null,
    tags: typeof rawTags === "string" && rawTags.trim() ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  });

  const started = await ingestUpload(db, user, {
    fileName: file.name,
    data: Buffer.from(await file.arrayBuffer()),
    customerId: fields.customerId,
    tags: fields.tags,
  });
  return json(started, { status: 202 });
});
