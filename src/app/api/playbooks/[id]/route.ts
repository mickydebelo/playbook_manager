import { updatePlaybookInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { archivePlaybook, getPlaybook, updatePlaybook } from "@/server/modules/playbooks/service";

export const GET = defineRoute({}, async ({ db, user, params }) => json(await getPlaybook(db, user, params.id!)));

export const PATCH = defineRoute({ body: updatePlaybookInputSchema }, async ({ db, user, body, params }) =>
  json(await updatePlaybook(db, user, params.id!, body)),
);

export const DELETE = defineRoute({}, async ({ db, user, params }) => {
  await archivePlaybook(db, user, params.id!);
  return new Response(null, { status: 204 });
});
