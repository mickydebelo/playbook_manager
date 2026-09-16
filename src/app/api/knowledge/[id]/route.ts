import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { setSourceStatus } from "@/server/modules/ingest/service";
import { getLibrarySource } from "@/server/modules/knowledge/service";

export const GET = defineRoute({}, async ({ db, params }) => json(await getLibrarySource(db, params.id!)));

/** The curator's review decision. Approving is what makes a source retrievable. */
export const PATCH = defineRoute({ body: z.object({ status: z.enum(["draft", "approved", "archived"]) }) }, async ({ db, user, body, params }) =>
  json(await setSourceStatus(db, user, params.id!, body.status)),
);
