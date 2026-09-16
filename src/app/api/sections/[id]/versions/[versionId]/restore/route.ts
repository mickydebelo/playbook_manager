import { defineRoute, json } from "@/server/http/handler";
import { restoreSectionVersion } from "@/server/modules/sections/service";

export const POST = defineRoute({}, async ({ db, user, params }) =>
  json(await restoreSectionVersion(db, user, params.id!, params.versionId!)),
);
