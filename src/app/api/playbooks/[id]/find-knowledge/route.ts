import { defineRoute, json } from "@/server/http/handler";
import { enqueueAndKick } from "@/server/modules/jobs";
import { requireEditablePlaybook } from "@/server/modules/sections/service";

export const POST = defineRoute({}, async ({ db, user, params }) => {
  await requireEditablePlaybook(db, user, params.id!);
  const job = await enqueueAndKick(db, { type: "find_knowledge", targetType: "playbook", targetId: params.id!, createdBy: user.id });
  return json({ jobId: job.id }, { status: 202 });
});
