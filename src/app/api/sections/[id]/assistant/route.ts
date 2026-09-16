import { assistantMessageSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { listAssistantMessages, sendAssistantMessage } from "@/server/modules/assistant/service";

export const GET = defineRoute({}, async ({ db, user, params }) => json(await listAssistantMessages(db, user, params.id!)));

export const POST = defineRoute({ body: assistantMessageSchema }, async ({ db, user, body, params }) =>
  json(await sendAssistantMessage(db, user, params.id!, body)),
);
