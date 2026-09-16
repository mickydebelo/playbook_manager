import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TemplatesView } from "@/features/templates/TemplatesView";
import { getServerUser } from "@/server/auth/server-session";
import { getDb } from "@/server/db/client";
import { templates } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(templates).orderBy(asc(templates.createdAt));
  return (
    <TemplatesView
      templates={rows.map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        description: t.description,
        sectionCount: t.outline.length, // the design counts top-level chapters ("8 sections")
        usageCount: t.usageCount,
        hasImage: t.hasImage,
      }))}
    />
  );
}
