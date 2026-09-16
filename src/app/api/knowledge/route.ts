import { knowledgeQuerySchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { listLibrary } from "@/server/modules/knowledge/service";

export const GET = defineRoute({ query: knowledgeQuerySchema }, async ({ db, query }) =>
  json(await listLibrary(db, { q: query.q, filter: query.filter })),
);
