/**
 * Removes HTML/XML and Office Open XML fragments that leak into plain text during DOCX, PPTX and
 * PDF extraction. Ported from the prototype's `src/lib/import/clean-import-text.ts`, where these
 * patterns were tuned against this document corpus over many real imports.
 */
const MARKUP_LEAK_PATTERN =
  /[<]|&lt;|&gt;|(?:^|\s)(?:w|a|p|r|mc|wp):[a-zA-Z]+|typeface\s*=|w:val\s*=|solidFill|paraId\s*=|rsid[A-Z]\s*=/i;

const XML_TAG_PATTERN = /<\/?[a-zA-Z][a-zA-Z0-9:_-]*(?:\s[^>]*)?\/?>/g;
const ESCAPED_TAG_PATTERN = /&lt;\/?[a-zA-Z][^&]*?&gt;/g;
const OOXML_ATTRIBUTE_PATTERN =
  /\b(?:typeface|lang|sz|b|i|u|strike|kern|cap|spc|dirty|err|smtClean|smtId|bmk|algn|marL|indent|lvl|defTabSz|rtl|eaLnBrk|fontAlgn|latinLnBrk|hangingPunct|tabLst|spcBef|spcAft|lnSpc|buFont|buChar|buAutoNum|buClr|buSzPct|buSzPts|buSzTx|buNone|buClrTx|buFontTx|buCharTx|marR|w14:[a-zA-Z]+|rsid[A-Z]|paraId|textId)\s*=\s*"[^"]*"/gi;
const OOXML_NAMESPACE_TOKEN_PATTERN =
  /\b(?:w|a|p|r|mc|wp|m|o|v|x|cx|bx|pic|c|dgm|lc|qv|w14|w15|w16|w16se|w16cid|w16cex|w16sdtdh):[a-zA-Z][a-zA-Z0-9]*/g;
const ORPHAN_TAG_FRAGMENT_PATTERN = /<\/?[a-zA-Z][a-zA-Z0-9:_-]*[^>\s]*/g;
const ORPHAN_CLOSE_FRAGMENT_PATTERN = /[a-zA-Z0-9:_-]+\s*\/?>/g;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // Ampersand last, so "&amp;lt;" does not become a tag.
    .replace(/&amp;/g, "&");
}

export function textContainsMarkupLeftovers(text: string): boolean {
  return MARKUP_LEAK_PATTERN.test(text);
}

export function stripMarkupLeftovers(text: string): string {
  if (!text.trim()) return "";
  let cleaned = decodeHtmlEntities(text);
  cleaned = cleaned.replace(ESCAPED_TAG_PATTERN, " ");
  cleaned = cleaned.replace(XML_TAG_PATTERN, " ");
  cleaned = cleaned.replace(OOXML_ATTRIBUTE_PATTERN, " ");
  cleaned = cleaned.replace(OOXML_NAMESPACE_TOKEN_PATTERN, " ");
  cleaned = cleaned.replace(ORPHAN_TAG_FRAGMENT_PATTERN, " ");
  cleaned = cleaned.replace(ORPHAN_CLOSE_FRAGMENT_PATTERN, " ");
  cleaned = cleaned.replace(/[<>]/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

/** Only pays the cost of the full strip when the text actually looks contaminated. */
export function cleanText(value: string): string {
  if (!value.trim()) return "";
  return textContainsMarkupLeftovers(value) ? stripMarkupLeftovers(value) : value.replace(/\s+/g, " ").trim();
}
