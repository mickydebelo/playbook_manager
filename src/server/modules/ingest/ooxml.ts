import { cleanText, decodeHtmlEntities } from "./clean-import-text";
import type { ZipArchive } from "./unzip";

/**
 * The two things Word and PowerPoint extraction share.
 *
 * Both were getting run text wrong in the same way, so it lives in one place now.
 */

/**
 * The visible text of one paragraph, in document order.
 *
 * Runs are concatenated **before** the text is cleaned. Cleaning each run separately looks
 * equivalent but silently deletes `<w:t xml:space="preserve"> </w:t>` — the run Word writes for a
 * space between differently-formatted words — which glues sentences into "Afewnotesaboutthedefense".
 * Structural breaks and tabs are the only other whitespace OOXML encodes as elements.
 */
export function paragraphRunsText(xml: string, tag: "w:t" | "a:t"): string {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<[wa]:(br|cr|tab)\\s*/?>`, "g");
  let out = "";
  for (const match of xml.matchAll(pattern)) {
    if (match[1] !== undefined) out += decodeHtmlEntities(match[1]);
    else out += match[2] === "tab" ? "\t" : "\n";
  }
  return cleanText(out);
}

/**
 * The main part of an OOXML package, resolved through the relationships rather than assumed.
 *
 * Word does not always name it `word/document.xml`: a file saved through some converters carries
 * `word/document2.xml`, which a hardcoded path silently reads as an empty document.
 */
export function mainPartPath(zip: ZipArchive, fallback: RegExp): string | null {
  const rels = zip.text("_rels/.rels");
  const target = rels
    ?.match(/<Relationship\b[^>]*Type="[^"]*\/officeDocument"[^>]*>/i)?.[0]
    ?.match(/Target="([^"]+)"/i)?.[1];
  if (target) {
    const normalised = target.replace(/^\/+/, "");
    if (zip.names.includes(normalised)) return normalised;
  }
  return zip.names.find((n) => fallback.test(n)) ?? null;
}
