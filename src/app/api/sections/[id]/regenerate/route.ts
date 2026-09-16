import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { enqueueAndKick } from "@/server/modules/jobs";
import { requireSection } from "@/server/modules/sections/service";

export const POST = defineRoute(
  { body: z.object({ instruction: z.string().trim().max(500).optional() }) },
  async ({ db, user, body, params }) => {
    await requireSection(db, user, params.id!, true);
    const job = await enqueueAndKick(db, {
      type: "regenerate_section",
      targetType: "section",
      targetId: params.id!,
      payload: body.instruction ? { instruction: body.instruction } : {},
      createdBy: user.id,
    });
    return json({ jobId: job.id }, { status: 202 });
  },
);
