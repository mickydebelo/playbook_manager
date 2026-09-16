/**
 * Throwaway probe: runs the ingest parsers over real files and prints what came out, so the
 * hand-written PDF and OOXML readers can be judged against documents rather than fixtures.
 *
 * Usage: npx tsx scripts/parse-probe.ts <file> [file...]
 */
import fs from "node:fs";
import path from "node:path";
import { chunkPages } from "../src/server/modules/ingest/chunk";
import { parseImportBuffer } from "../src/server/modules/ingest/parse";

for (const file of process.argv.slice(2)) {
  const name = path.basename(file);
  try {
    const parsed = parseImportBuffer(fs.readFileSync(file), name);
    const chunks = chunkPages(parsed.pages, parsed.title ?? name);
    const words = parsed.pages.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
    console.log(`\n=== ${name} [${parsed.fileType}] ${parsed.error ? `ERROR: ${parsed.error}` : ""}`);
    console.log(`pages=${parsed.pages.length} pageCount=${parsed.pageCount} words=${words} chunks=${chunks.length} title=${JSON.stringify(parsed.title)}`);
    for (const page of parsed.pages.slice(0, 2)) {
      console.log(`  p.${page.pageNo ?? "-"} ${page.heading ? `[${page.heading}] ` : ""}${page.text.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  } catch (err) {
    console.log(`\n=== ${name} THREW: ${err instanceof Error ? err.message : String(err)}`);
  }
}
