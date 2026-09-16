import { eq } from "drizzle-orm";
import { exports as exportsTable } from "../../../db/schema";
import { inlineAssets } from "../../export/assets";
import { buildRenderInput } from "../../export/document";
import { renderPlaybookDocx } from "../../export/docx";
import { htmlToPdf } from "../../export/pdf";
import { renderPlaybookHtml } from "../../export/render-html";
import { storeAsset } from "../../storage";
import { loadActiveUser } from "../../../auth/current-user";
import type { JobContext } from "../worker";

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

function fileName(title: string, ext: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "playbook"}.${ext}`;
}

/**
 * Renders the playbook and stores the artifact. Word is generated directly as Office Open XML;
 * PDF is the preview HTML printed by headless Chrome, so both describe the same document.
 */
export async function exportPlaybookHandler({ db, job, progress }: JobContext): Promise<Record<string, unknown>> {
  const exportId = job.targetId;
  const [row] = await db.select().from(exportsTable).where(eq(exportsTable.id, exportId)).limit(1);
  if (!row) throw new Error("Export not found");

  const actor = row.requestedBy ? await loadActiveUser(db, row.requestedBy) : null;
  if (!actor) throw new Error("The user who requested this export is no longer active");

  await db.update(exportsTable).set({ status: "running" }).where(eq(exportsTable.id, exportId));
  await progress({ done: 0, total: 2, label: "Assembling the document" });

  // Chrome prints from a file:// page, so brand images and fonts travel with the markup.
  const input = await buildRenderInput(db, actor, row.playbookId, {
    includeSources: row.includeSources,
    assets: row.format === "pdf" ? await inlineAssets() : undefined,
  });

  await progress({ done: 1, total: 2, label: row.format === "pdf" ? "Rendering the PDF" : "Building the Word file" });
  let data: Buffer;
  if (row.format === "pdf") data = await htmlToPdf(renderPlaybookHtml(input));
  else if (row.format === "docx") data = renderPlaybookDocx(input);
  else throw new Error(`${row.format.toUpperCase()} export is not supported yet`);

  const asset = await storeAsset(db, {
    data,
    fileName: fileName(input.title, row.format),
    mimeType: MIME[row.format] ?? "application/octet-stream",
    prefix: `exports/${row.playbookId}`,
    uploadedBy: actor.id,
  });

  await db
    .update(exportsTable)
    .set({ status: "succeeded", artifactAssetId: asset.id, completedAt: new Date() })
    .where(eq(exportsTable.id, exportId));
  await progress({ done: 2, total: 2, label: "Done" });

  return { exportId, assetId: asset.id, fileName: asset.fileName, sizeBytes: asset.sizeBytes };
}
