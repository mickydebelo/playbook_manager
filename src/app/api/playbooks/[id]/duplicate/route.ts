import { defineRoute, json } from "@/server/http/handler";
import { duplicatePlaybook } from "@/server/modules/playbooks/service";

export const POST = defineRoute({}, async ({ db, user, params }) => json(await duplicatePlaybook(db, user, params.id!), { status: 201 }));
