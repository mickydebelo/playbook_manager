import { defineRoute, json } from "@/server/http/handler";
import { listSectionContents } from "@/server/modules/sections/service";

// Polled while a draft job runs so sections appear as they are written.
export const GET = defineRoute({}, async ({ db, user, params }) => json(await listSectionContents(db, user, params.id!)));
