import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { enqueueAndKick } from "@/server/modules/jobs";
import { requireEditablePlaybook } from "@/server/modules/sections/service";

export const POST = defineRoute({ body: z.object({ overwrite: z.boolean().default(false) }) }, async ({ db, user, body, params }) => {
  await requireEditablePlaybook(db, user, params.id!);
  const job = await enqueueAndKick(db, {
    type: "create_draft",
    targetType: "playbook",
    targetId: params.id!,
    payload: { overwrite: body.overwrite },
    createdBy: user.id,
  });
  return json({ jobId: job.id }, { status: 202 });
});
