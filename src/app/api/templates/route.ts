import { asc } from "drizzle-orm";
import { templates } from "@/server/db/schema";
import { defineRoute, json } from "@/server/http/handler";

export const GET = defineRoute({}, async ({ db }) => {
  const rows = await db.select().from(templates).orderBy(asc(templates.createdAt));
  return json(
    rows.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      description: t.description,
      sectionCount: t.outline.length, // the design counts top-level chapters ("8 sections")
      usageCount: t.usageCount,
      hasImage: t.hasImage,
      defaultFocusAreas: t.defaultFocusAreas,
    })),
  );
});
