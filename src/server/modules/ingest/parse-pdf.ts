import { inflateRawSync, inflateSync } from "node:zlib";
import { cleanText } from "./clean-import-text";
import type { ParsedDocument, ParsedPage } from "./types";

/**
 * PDF text extraction, one passage per page.
 *
 * The prototype used `pdfjs-dist`, which cannot be installed here — the Artifactory mirror is not
 * reachable from the Autodesk network — so the content streams are read directly: inflate each
 * page's stream, then walk the text-showing operators. Page granularity is the point: it is what
 * finally lets `source_chunks.page_no` carry a real page, so a draft can cite "p. 12".
 *
 * This understands the common case — Flate-compressed content, simple and Type0 fonts with a
 * ToUnicode CMap. It does not attempt encrypted files, or fonts with no Unicode mapping at all.
 * When extraction yields text that does not look like prose, the caller is told nothing was
 * extracted rather than being handed noise to embed.
 */
const MAX_STREAM_BYTES = 80 * 1024 * 1024;

type PdfObject = { dict: string; stream: Buffer | null };

/** Latin-1, which is what a PDF literal string is unless a CMap says otherwise. */
const latin1 = (bytes: number[]): string => Buffer.from(bytes).toString("latin1");

function parseObjects(buf: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const text = buf.toString("latin1");
  const pattern = /(\d+)\s+\d+\s+obj\b/g;

  for (const match of text.matchAll(pattern)) {
    const num = Number(match[1]);
    const bodyStart = (match.index ?? 0) + match[0].length;
    const endObj = text.indexOf("endobj", bodyStart);
    const body = text.slice(bodyStart, endObj < 0 ? undefined : endObj);

    const streamAt = body.indexOf("stream");
    if (streamAt < 0) {
      objects.set(num, { dict: body, stream: null });
      continue;
    }
    const dict = body.slice(0, streamAt);
    // "stream" is followed by CRLF or LF before the bytes begin.
    let dataStart = bodyStart + streamAt + "stream".length;
    if (text[dataStart] === "\r") dataStart++;
    if (text[dataStart] === "\n") dataStart++;

    const declared = Number(dict.match(/\/Length\s+(\d+)/)?.[1] ?? NaN);
    let dataEnd: number;
    if (Number.isFinite(declared) && declared > 0 && dataStart + declared <= buf.length) {
      dataEnd = dataStart + declared;
    } else {
      // An indirect /Length, which needs the stream's own terminator instead.
      const marker = text.indexOf("endstream", dataStart);
      dataEnd = marker < 0 ? buf.length : marker;
    }
    objects.set(num, { dict, stream: buf.subarray(dataStart, Math.min(dataEnd, buf.length)) });
  }
  return objects;
}

/** Applies the one filter that matters in practice. Anything else is left alone. */
function decodeStream(obj: PdfObject): Buffer | null {
  if (!obj.stream) return null;
  if (!/\/Filter\s*\/?\[?\s*\/?FlateDecode/.test(obj.dict)) return obj.stream;
  const limit = { maxOutputLength: MAX_STREAM_BYTES };
  try {
    return inflateSync(obj.stream, limit);
  } catch {
    // Producers in the wild are not all correct: some write a raw deflate stream with no zlib
    // header, and some leave a stray byte before it. Both are recoverable, and a page of text is
    // worth the second attempt.
    for (const candidate of [obj.stream.subarray(1), obj.stream]) {
      try {
        return inflateRawSync(candidate, limit);
      } catch {
        // try the next interpretation
      }
    }
    return null;
  }
}

const refIn = (text: string | undefined): number | null => {
  const n = text?.match(/(\d+)\s+\d+\s+R/)?.[1];
  return n ? Number(n) : null;
};

/** Pages in reading order, walking the page tree when it resolves and falling back to file order. */
function orderedPages(objects: Map<number, PdfObject>): number[] {
  const isPage = (num: number) => /\/Type\s*\/Page\b/.test(objects.get(num)?.dict ?? "");
  const rootNum = [...objects.entries()].find(([, o]) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict))?.[0];

  const out: number[] = [];
  const seen = new Set<number>();
  const walk = (num: number, depth: number) => {
    if (depth > 64 || seen.has(num)) return;
    seen.add(num);
    const dict = objects.get(num)?.dict ?? "";
    if (isPage(num)) {
      out.push(num);
      return;
    }
    const kids = dict.match(/\/Kids\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    for (const kid of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(kid[1]), depth + 1);
  };
  if (rootNum !== undefined) walk(rootNum, 0);

  if (!out.length) return [...objects.keys()].filter(isPage);
  return out;
}

// ---- ToUnicode CMaps ------------------------------------------------------

type Cmap = { map: Map<number, string>; twoByte: boolean };

const hexToString = (hex: string): string => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const code = parseInt(clean.slice(i, i + 4), 16);
    if (Number.isFinite(code)) out += String.fromCharCode(code);
  }
  return out;
};

function parseCmap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? "").matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(pair[1]!, 16), hexToString(pair[2]!));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1] ?? "";
    for (const range of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const from = parseInt(range[1]!, 16);
      const to = parseInt(range[2]!, 16);
      const base = parseInt(range[3]!, 16);
      for (let c = from; c <= to && c - from < 65_536; c++) map.set(c, String.fromCharCode(base + (c - from)));
    }
    for (const range of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const from = parseInt(range[1]!, 16);
      const items = [...(range[3] ?? "").matchAll(/<([0-9a-fA-F]+)>/g)];
      items.forEach((item, i) => map.set(from + i, hexToString(item[1]!)));
    }
  }
  return map;
}

/** The fonts named in a page's resources, each with its Unicode mapping when it has one. */
function fontsForPage(pageDict: string, objects: Map<number, PdfObject>): Map<string, Cmap> {
  const fonts = new Map<string, Cmap>();

  let resources = pageDict.match(/\/Resources\s*(<<[\s\S]*?>>)/)?.[1] ?? "";
  if (!resources) {
    const ref = refIn(pageDict.match(/\/Resources\s+(\d+\s+\d+\s+R)/)?.[1]);
    if (ref !== null) resources = objects.get(ref)?.dict ?? "";
  }
  const fontDict = resources.match(/\/Font\s*(<<[\s\S]*?>>)/)?.[1] ?? (() => {
    const ref = refIn(resources.match(/\/Font\s+(\d+\s+\d+\s+R)/)?.[1]);
    return ref === null ? "" : (objects.get(ref)?.dict ?? "");
  })();

  for (const entry of fontDict.matchAll(/\/([A-Za-z0-9._-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const name = entry[1]!;
    const font = objects.get(Number(entry[2]));
    if (!font) continue;
    const twoByte = /\/Subtype\s*\/Type0\b/.test(font.dict);
    const toUnicodeRef = refIn(font.dict.match(/\/ToUnicode\s+(\d+\s+\d+\s+R)/)?.[1]);
    const cmapObj = toUnicodeRef === null ? null : objects.get(toUnicodeRef);
    const cmapText = cmapObj ? (decodeStream(cmapObj)?.toString("latin1") ?? "") : "";
    fonts.set(name, { map: cmapText ? parseCmap(cmapText) : new Map(), twoByte });
  }
  return fonts;
}

// ---- Content stream walking ----------------------------------------------

/** Decodes one PDF string's bytes through the active font. */
function decodeShownString(bytes: number[], font: Cmap | undefined): string {
  if (!font || font.map.size === 0) {
    // No mapping available: a 2-byte font would give mojibake, a simple font is Latin-1.
    return font?.twoByte ? "" : latin1(bytes);
  }
  const step = font.twoByte ? 2 : 1;
  let out = "";
  for (let i = 0; i < bytes.length; i += step) {
    const code = step === 2 ? ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0) : (bytes[i] ?? 0);
    const mapped = font.map.get(code);
    out += mapped !== undefined ? mapped : step === 1 ? latin1([code]) : "";
  }
  return out;
}

function extractText(content: string, fonts: Map<string, Cmap>): string {
  const lines: string[] = [];
  let current = "";
  let font: Cmap | undefined;

  const pushLine = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
    current = "";
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;

    // A literal string: ( ... ) with backslash escapes and balanced parentheses.
    if (ch === "(") {
      const bytes: number[] = [];
      let depth = 1;
      i++;
      for (; i < content.length; i++) {
        const c = content[i]!;
        if (c === "\\") {
          const next = content[++i];
          if (next === undefined) break;
          const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
          if (next in simple) bytes.push(simple[next]!);
          else if (next >= "0" && next <= "7") {
            let oct = next;
            while (oct.length < 3 && content[i + 1] !== undefined && content[i + 1]! >= "0" && content[i + 1]! <= "7") oct += content[++i];
            bytes.push(parseInt(oct, 8) & 0xff);
          } else if (next !== "\n") bytes.push(next.charCodeAt(0));
          continue;
        }
        if (c === "(") depth++;
        if (c === ")" && --depth === 0) break;
        bytes.push(c.charCodeAt(0));
      }
      current += decodeShownString(bytes, font);
      continue;
    }

    // A hex string: < ... >, but not the << >> dictionary delimiter.
    if (ch === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i);
      if (end < 0) break;
      const hex = content.slice(i + 1, end).replace(/[^0-9a-fA-F]/g, "");
      const bytes: number[] = [];
      for (let h = 0; h < hex.length; h += 2) bytes.push(parseInt(hex.slice(h, h + 2).padEnd(2, "0"), 16));
      current += decodeShownString(bytes, font);
      i = end;
      continue;
    }

    // Operators that move to a new line, and the font selector.
    if (ch === "T") {
      const op = content.slice(i, i + 2);
      if (op === "Td" || op === "TD" || op === "T*" || op === "Tm") {
        pushLine();
        i++;
        continue;
      }
      if (op === "Tf") {
        const name = content.slice(Math.max(0, i - 40), i).match(/\/([A-Za-z0-9._-]+)\s+[\d.]+\s*$/)?.[1];
        if (name) font = fonts.get(name);
        i++;
        continue;
      }
    }
    if (ch === "E" && content.slice(i, i + 2) === "ET") pushLine();
  }
  pushLine();
  return lines.join("\n");
}

/**
 * Whether extracted text looks like prose rather than decoding noise. Embedding mojibake would
 * quietly poison retrieval, which is worse than admitting a PDF could not be read.
 */
export function looksLikeProse(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  if (stripped.length < 24) return false;
  const letters = (stripped.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
  if (letters / stripped.length < 0.55) return false;

  // The letter ratio alone is not enough: a subset font decoded through the wrong mapping produces
  // accented letters in abundance, and that passed the check while being unreadable. Word shape
  // catches it and does not depend on the language — mis-decoded text comes out as a scatter of
  // one-character tokens, while prose in any language averages several characters per word.
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return false;
  const singles = tokens.filter((t) => t.length === 1).length;
  const averageLength = tokens.reduce((n, t) => n + t.length, 0) / tokens.length;
  return averageLength >= 2.5 && singles / tokens.length <= 0.35;
}

export function parsePdf(buffer: Buffer): ParsedDocument {
  const objects = parseObjects(buffer);
  const pageNums = orderedPages(objects);

  const pages: ParsedPage[] = [];
  pageNums.forEach((num, index) => {
    const pageDict = objects.get(num)?.dict ?? "";
    const fonts = fontsForPage(pageDict, objects);

    const contentRefs = [...(pageDict.match(/\/Contents\s*\[([\s\S]*?)\]/)?.[1] ?? pageDict.match(/\/Contents\s+(\d+\s+\d+\s+R)/)?.[1] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));

    const content = contentRefs
      .map((ref) => {
        const obj = objects.get(ref);
        return obj ? (decodeStream(obj)?.toString("latin1") ?? "") : "";
      })
      .join("\n");
    if (!content) return;

    const text = cleanText(extractText(content, fonts));
    if (!looksLikeProse(text)) return;
    pages.push({ pageNo: index + 1, heading: null, text });
  });

  return { title: null, pages, pageCount: pageNums.length || null };
}
