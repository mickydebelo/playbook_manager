import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { startExport, SUPPORTED_FORMATS } from "@/server/modules/export/service";

export const POST = defineRoute(
  {
    body: z.object({
      format: z.enum(SUPPORTED_FORMATS),
      includeSources: z.boolean().default(false),
      includeComments: z.boolean().default(false),
    }),
  },
  async ({ db, user, body, params }) => json(await startExport(db, user, params.id!, body), { status: 202 }),
);
