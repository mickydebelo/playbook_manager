import { defineRoute, json } from "@/server/http/handler";
import { listSectionSourceExcerpts } from "@/server/modules/knowledge/excerpts";

/**
 * The passages that caused this source to be proposed for this section. Step 2's preview panel
 * shows these instead of a mock document page, so the extraction is visible while choosing.
 */
export const GET = defineRoute({}, async ({ db, user, params }) =>
  json(await listSectionSourceExcerpts(db, user, params.id!, params.sourceId!)),
);
