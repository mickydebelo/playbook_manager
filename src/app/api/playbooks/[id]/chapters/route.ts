import { createChapterInputSchema } from "@/shared/contracts";
import { defineRoute, json } from "@/server/http/handler";
import { addChapter } from "@/server/modules/sections/service";

export const POST = defineRoute({ body: createChapterInputSchema }, async ({ db, user, body, params }) => {
  const chapter = await addChapter(db, user, params.id!, body);
  return json({ id: chapter.id, title: chapter.title, position: chapter.position }, { status: 201 });
});
