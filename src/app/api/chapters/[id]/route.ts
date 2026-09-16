import { updateChapterInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { removeChapter, updateChapter } from "@/server/modules/sections/service";

export const PATCH = defineRoute({ body: updateChapterInputSchema }, async ({ db, user, body, params }) => {
  const chapter = await updateChapter(db, user, params.id!, body);
  return json({ id: chapter.id, title: chapter.title, position: chapter.position });
});

export const DELETE = defineRoute({}, async ({ db, user, params }) => {
  await removeChapter(db, user, params.id!);
  return new Response(null, { status: 204 });
});
