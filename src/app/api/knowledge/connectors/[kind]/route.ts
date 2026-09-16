import { z } from "zod";
import { defineRoute, json } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { connectorFor } from "@/server/modules/ingest/connectors";
import { ingestFromConnector } from "@/server/modules/ingest/service";

const CONNECTOR_KINDS = ["local_folder", "sharepoint"] as const;

/** The kind is matched against a fixed list; it never reaches a filesystem or a module path. */
function kindFrom(params: Record<string, string>): (typeof CONNECTOR_KINDS)[number] {
  const kind = CONNECTOR_KINDS.find((k) => k === params.kind);
  if (!kind) throw new AppError("not_found", "Unknown connector");
  return kind;
}

/** What is available to ingest, without downloading anything. */
export const GET = defineRoute({}, async ({ params }) => {
  const files = await connectorFor(kindFrom(params)).list();
  return json(files.map((f) => ({ ...f, modifiedAt: f.modifiedAt?.toISOString() ?? null })));
});

export const POST = defineRoute(
  {
    body: z.object({
      fileId: z.string().min(1).max(512),
      customerId: z.string().uuid().nullable().default(null),
      tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    }),
  },
  async ({ db, user, body, params }) =>
    json(
      await ingestFromConnector(db, user, {
        connector: kindFrom(params),
        fileId: body.fileId,
        customerId: body.customerId,
        tags: body.tags,
      }),
      { status: 202 },
    ),
);
