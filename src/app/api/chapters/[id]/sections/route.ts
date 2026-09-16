import { createSectionInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { addSection, toSectionDetail } from "@/server/modules/sections/service";

export const POST = defineRoute({ body: createSectionInputSchema }, async ({ db, user, body, params }) => {
  const section = await addSection(db, user, params.id!, body);
  return json(toSectionDetail(section), { status: 201 });
});
