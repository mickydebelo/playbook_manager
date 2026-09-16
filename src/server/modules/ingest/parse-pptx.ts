import { paragraphRunsText } from "./ooxml";
import type { ParsedDocument, ParsedPage } from "./types";
import { openZip, type ZipArchive } from "./unzip";

/**
 * PowerPoint text extraction, ported from the prototype's `parse-pptx.ts`.
 *
 * One passage per slide, which maps a slide number straight onto `source_chunks.page_no`, so a
 * citation can say which slide a claim came from. Hidden slides are skipped: they are usually
 * superseded material and quoting them in a customer deliverable would be wrong.
 */
function slideNumber(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
}

function hiddenSlides(zip: ZipArchive): Set<string> {
  const hidden = new Set<string>();
  const presentation = zip.text("ppt/presentation.xml");
  const rels = zip.text("ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) return hidden;

  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
    const target = (m[2] ?? "").replace(/^\.\.\//, "");
    relMap.set(m[1] ?? "", target.startsWith("ppt/") ? target : `ppt/${target}`);
  }
  for (const m of presentation.matchAll(/<p:sldId[^>]*\/?>/g)) {
    const tag = m[0];
    if (!/\sshow="0"/.test(tag)) continue;
    const target = relMap.get(tag.match(/r:id="([^"]+)"/)?.[1] ?? "");
    if (target) hidden.add(target);
  }
  return hidden;
}

/** Slide text lives in <a:t> runs; <a:p> boundaries become line breaks. */
function slideText(xml: string): { title: string | null; text: string } {
  const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)].map((m) => m[0]);
  const lines = paragraphs.map((p) => paragraphRunsText(p, "a:t")).filter(Boolean);
  return { title: lines[0] ?? null, text: lines.join("\n") };
}

export function parsePptx(buffer: Buffer): ParsedDocument {
  const zip = openZip(buffer);
  const hidden = hiddenSlides(zip);

  const slidePaths = zip.names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n) && !hidden.has(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const pages: ParsedPage[] = [];
  let title: string | null = null;

  for (const path of slidePaths) {
    const xml = zip.text(path) ?? "";
    const { title: slideTitle, text } = slideText(xml);
    if (!title) title = slideTitle;
    if (!text.trim()) continue;
    pages.push({ pageNo: slideNumber(path), heading: slideTitle, text });
  }

  return { title, pages, pageCount: slidePaths.length || null };
}
