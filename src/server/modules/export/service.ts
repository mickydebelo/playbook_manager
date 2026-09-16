import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { exports as exportsTable } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { conflict, notFound } from "../../http/errors";
import { assertCanManage } from "../playbooks/access";
import { loadAccess } from "../playbooks/repository";
import { enqueueAndKick } from "../jobs";
import { readAsset } from "../storage";

export const SUPPORTED_FORMATS = ["docx", "pdf"] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

/** Starts an export. Only the owner or an admin can produce a customer-facing deliverable. */
export async function startExport(
  db: Db,
  user: CurrentUser,
  playbookId: string,
  input: { format: SupportedFormat; includeSources: boolean; includeComments: boolean },
): Promise<{ exportId: string; jobId: string }> {
  const access = await loadAccess(db, playbookId);
  if (!access) throw notFound("Playbook");
  assertCanManage(access, user);

  const [row] = await db
    .insert(exportsTable)
    .values({
      playbookId,
      format: input.format,
      includeSources: input.includeSources,
      includeComments: input.includeComments,
      requestedBy: user.id,
    })
    .returning();

  const job = await enqueueAndKick(db, { type: "export_playbook", targetType: "export", targetId: row!.id, createdBy: user.id });
  await db.update(exportsTable).set({ jobId: job.id }).where(eq(exportsTable.id, row!.id));
  return { exportId: row!.id, jobId: job.id };
}

export async function getExport(db: Db, user: CurrentUser, exportId: string) {
  const [row] = await db.select().from(exportsTable).where(eq(exportsTable.id, exportId)).limit(1);
  if (!row) throw notFound("Export");
  const access = await loadAccess(db, row.playbookId);
  if (!access) throw notFound("Playbook");
  assertCanManage(access, user);
  return row;
}

export async function downloadExport(db: Db, user: CurrentUser, exportId: string) {
  const row = await getExport(db, user, exportId);
  if (row.status !== "succeeded" || !row.artifactAssetId) throw conflict("This export is not ready yet");
  return readAsset(db, row.artifactAssetId);
}

export async function latestExport(db: Db, user: CurrentUser, playbookId: string, format: SupportedFormat) {
  const access = await loadAccess(db, playbookId);
  if (!access) throw notFound("Playbook");
  assertCanManage(access, user);
  const [row] = await db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.playbookId, playbookId), eq(exportsTable.format, format)))
    .orderBy(desc(exportsTable.createdAt))
    .limit(1);
  return row ?? null;
}
