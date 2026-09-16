import { defineRoute } from "@/server/http/handler";
import { downloadExport } from "@/server/modules/export/service";

/** Authenticated download of a finished export. */
export const GET = defineRoute({}, async ({ db, user, params }) => {
  const file = await downloadExport(db, user, params.exportId!);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `attachment; filename="${file.fileName.replace(/"/g, "")}"`,
      "content-length": String(file.data.length),
      "cache-control": "private, no-store",
    },
  });
});
