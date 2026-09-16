import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { latestJobFor, toJobDto } from "@/server/modules/jobs";
import { requireReadablePlaybook } from "@/server/modules/sections/service";

/**
 * The most recent job of a type for this playbook, so a reload during a long draft reattaches to it
 * instead of losing the progress UI.
 */
export const GET = defineRoute(
  { query: z.object({ type: z.enum(["find_knowledge", "create_draft", "export_playbook"]).default("create_draft") }) },
  async ({ db, user, query, params }) => {
    await requireReadablePlaybook(db, user, params.id!);
    const job = await latestJobFor(db, query.type, params.id!);
    return json(job ? toJobDto(job) : null);
  },
);
