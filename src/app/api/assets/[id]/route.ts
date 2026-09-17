import { eq } from "drizzle-orm";
import { defineRoute } from "@/server/http/handler";
import { notFound } from "@/server/http/errors";
import { assets, customers } from "@/server/db/schema";
import { getStorage } from "@/server/modules/storage";

/**
 * Streams an image asset for use as an <img> source (Step 1 thumbnail, document preview cover).
 *
 * The `assets` table also holds ingested documents and export artifacts, so this endpoint is
 * deliberately narrow: it serves a row only when it is an image AND either the caller uploaded it
 * or it is currently in use as a customer logo. Anything else answers "not found", so a guessed id
 * cannot exfiltrate another user's documents.
 */
export const GET = defineRoute({}, async ({ db, user, params }) => {
  const [asset] = await db.select().from(assets).where(eq(assets.id, params.id!)).limit(1);
  if (!asset || !asset.mimeType.startsWith("image/")) throw notFound("File");

  const ownedByCaller = asset.uploadedBy === user.id;
  let isCustomerLogo = false;
  if (!ownedByCaller) {
    const [ref] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.logoAssetId, asset.id))
      .limit(1);
    isCustomerLogo = !!ref;
  }
  if (!ownedByCaller && !isCustomerLogo) throw notFound("File");

  const data = await getStorage().get(asset.storageKey);
  // Content is immutable (the storage key is the content hash), so it is safe to cache privately.
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": asset.mimeType,
      "cache-control": "private, max-age=3600",
      "content-length": String(asset.sizeBytes),
    },
  });
});
