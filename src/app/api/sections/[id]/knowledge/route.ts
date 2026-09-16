import { sectionKnowledgeQuerySchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { listSectionCandidates } from "@/server/modules/knowledge/service";

export const GET = defineRoute({ query: sectionKnowledgeQuerySchema }, async ({ db, user, query, params }) =>
  json(await listSectionCandidates(db, user, params.id!, query)),
);
