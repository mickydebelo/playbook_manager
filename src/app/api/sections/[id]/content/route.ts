import { saveSectionContentSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { saveSectionContent } from "@/server/modules/sections/service";

// Autosave target. A stale `baseSavedAt` returns 409 rather than overwriting a collaborator.
export const PUT = defineRoute({ body: saveSectionContentSchema }, async ({ db, user, body, params }) =>
  json(await saveSectionContent(db, user, params.id!, body)),
);
