import { mainPartPath, paragraphRunsText } from "./ooxml";
import type { ParsedDocument, ParsedPage } from "./types";
import { openZip } from "./unzip";

/**
 * Word text extraction, ported from the prototype's `parse-docx.ts`.
 *
 * Deliberately regex-and-ZIP based rather than a full OOXML implementation: it is already proven
 * against this document corpus. A .docx has no pages until it is laid out, so passages carry their
 * heading instead of a page number and `page_no` stays null — honest, rather than invented.
 */
const paragraphText = (xml: string): string => paragraphRunsText(xml, "w:t");

function headingLevel(xml: string): number | null {
  const style = xml.match(/<w:pStyle\s[^>]*w:val="([^"]+)"/i)?.[1];
  if (!style) return null;
  if (/^title$/i.test(style)) return 1;
  const level = style.match(/^heading(\d)$/i)?.[1];
  return level ? Number(level) : null;
}

function isListItem(xml: string): boolean {
  return /<w:numPr\b/.test(xml);
}

export function parseDocx(buffer: Buffer): ParsedDocument {
  const zip = openZip(buffer);
  const part = mainPartPath(zip, /^word\/document\d*\.xml$/i);
  const xml = (part && zip.text(part)) ?? "";

  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);

  const pages: ParsedPage[] = [];
  let heading: string | null = null;
  let title: string | null = null;
  let buffered: string[] = [];

  const flush = () => {
    const text = buffered.join("\n").trim();
    if (text) pages.push({ pageNo: null, heading, text });
    buffered = [];
  };

  for (const para of paragraphs) {
    const text = paragraphText(para);
    const level = headingLevel(para);

    if (level !== null && text) {
      // A heading closes the passage before it, so each passage stays on one topic.
      flush();
      heading = text;
      if (!title && level === 1) title = text;
      continue;
    }
    if (!text) continue;
    buffered.push(isListItem(para) ? `- ${text}` : text);
  }
  flush();

  // A document with no headings at all still has to produce something retrievable.
  if (!pages.length) {
    const all = paragraphs.map(paragraphText).filter(Boolean).join("\n").trim();
    if (all) pages.push({ pageNo: null, heading: null, text: all });
  }

  return { title, pages, pageCount: null };
}
