import { setSourceSelectionSchema } from "@/shared/contracts";
import { defineRoute } from "@/server/http/handler";
import { setSectionSourceSelection } from "@/server/modules/knowledge/service";

export const PUT = defineRoute({ body: setSourceSelectionSchema }, async ({ db, user, body, params }) => {
  await setSectionSourceSelection(db, user, params.id!, params.sourceId!, body.selected);
  return new Response(null, { status: 204 });
});
