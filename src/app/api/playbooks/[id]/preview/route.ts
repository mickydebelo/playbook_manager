import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { renderPlaybookPreview } from "@/server/modules/export/document";

/**
 * The printable document as HTML. Step 4 shows this in a sandboxed iframe and the PDF export
 * prints the same markup, so the preview is the document rather than a mock of it.
 */
export const GET = defineRoute(
  { query: z.object({ sources: z.enum(["0", "1"]).default("0") }) },
  async ({ db, user, query, params }) => {
    const html = await renderPlaybookPreview(db, user, params.id!, { includeSources: query.sources === "1" });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  },
);
