import { defineRoute, json } from "@/server/http/handler";
import { suggestIntro } from "@/server/modules/assistant/service";

export const POST = defineRoute({}, async ({ db, user, params }) => json({ text: await suggestIntro(db, user, params.id!) }));
