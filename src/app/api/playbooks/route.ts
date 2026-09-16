import { createPlaybookInputSchema, listPlaybooksQuerySchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { createPlaybook, listPlaybooks } from "@/server/modules/playbooks/service";

export const GET = defineRoute({ query: listPlaybooksQuerySchema }, async ({ db, user, query }) => {
  return json(await listPlaybooks(db, user, { status: query.status }));
});

export const POST = defineRoute({ body: createPlaybookInputSchema }, async ({ db, user, body }) => {
  return json(await createPlaybook(db, user, body), { status: 201 });
});
