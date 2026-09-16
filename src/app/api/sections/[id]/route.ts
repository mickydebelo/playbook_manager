import { updateSectionInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { getSection, removeSection, toSectionDetail, updateSection } from "@/server/modules/sections/service";

export const GET = defineRoute({}, async ({ db, user, params }) => json(await getSection(db, user, params.id!)));

export const PATCH = defineRoute({ body: updateSectionInputSchema }, async ({ db, user, body, params }) =>
  json(toSectionDetail(await updateSection(db, user, params.id!, body))),
);

export const DELETE = defineRoute({}, async ({ db, user, params }) => {
  await removeSection(db, user, params.id!);
  return new Response(null, { status: 204 });
});
