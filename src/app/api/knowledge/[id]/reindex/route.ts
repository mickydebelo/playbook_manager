import { defineRoute, json } from "@/server/http/handler";
import { reindexSource } from "@/server/modules/ingest/service";

/** Re-parses a source from its stored original, for when the parser or the chunking improves. */
export const POST = defineRoute({}, async ({ db, user, params }) => json(await reindexSource(db, user, params.id!), { status: 202 }));
