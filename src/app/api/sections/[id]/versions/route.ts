import { defineRoute, json } from "@/server/http/handler";
import { listSectionVersions } from "@/server/modules/sections/service";

export const GET = defineRoute({}, async ({ db, user, params }) => json(await listSectionVersions(db, user, params.id!)));
