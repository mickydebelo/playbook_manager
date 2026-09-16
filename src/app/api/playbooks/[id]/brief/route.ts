import { briefInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { replaceBrief } from "@/server/modules/playbooks/service";

export const PUT = defineRoute({ body: briefInputSchema }, async ({ db, user, body, params }) =>
  json(await replaceBrief(db, user, params.id!, body)),
);
