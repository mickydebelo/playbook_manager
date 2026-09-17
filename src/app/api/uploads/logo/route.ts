import { defineRoute, json } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { storeAsset } from "@/server/modules/storage";

/** Raster formats only. SVG is deliberately excluded: it can carry inline scripts and we serve it back by URL. */
const ALLOWED_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_LABEL = "2 MB";

/** File-extension fallback when the browser sends a vague content-type. Extension comes from the sanitised name below. */
const EXT_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Uploads a customer brand logo used on the document cover. Multipart, so the route reads the form
 * itself (the wrapper's body parser is JSON-only). The declared MIME type is cross-checked against
 * an allow-list and the file extension; the filename is only used after sanitisation in storeAsset.
 */
export const POST = defineRoute({}, async ({ db, user, req }) => {
  const form = await req.formData().catch(() => {
    throw new AppError("validation_failed", "Send the file as multipart/form-data");
  });

  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("validation_failed", "No image was attached");
  if (file.size > MAX_LOGO_BYTES) throw new AppError("validation_failed", `That image is larger than ${MAX_LOGO_LABEL}`);

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const declared = (file.type || "").toLowerCase();
  // Trust the declared type only when it is on the allow-list; otherwise fall back to the extension.
  const mimeType = ALLOWED_LOGO_MIME.has(declared) ? declared : EXT_MIME[ext];
  if (!mimeType || !ALLOWED_LOGO_MIME.has(mimeType)) {
    throw new AppError("validation_failed", "Upload a PNG, JPEG or WebP image");
  }

  const asset = await storeAsset(db, {
    data: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    mimeType,
    prefix: "logos",
    uploadedBy: user.id,
  });

  return json({ assetId: asset.id }, { status: 201 });
});
