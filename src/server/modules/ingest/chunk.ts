import type { ParsedPage } from "./types";

/**
 * Splits parsed pages into retrievable chunks, each keeping the page it came from.
 *
 * Sized to roughly a long paragraph: big enough to carry an argument, small enough that a vector
 * match points at something specific. Boundaries are preferred at blank lines and then sentence
 * ends, so a chunk rarely starts mid-thought.
 */
const TARGET_CHARS = 900;
const MAX_CHARS = 1400;
const MIN_CHARS = 120;

export type Chunk = { position: number; pageNo: number | null; text: string };

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    // Prefer a sentence end inside the window, else fall back to a word boundary.
    const window = rest.slice(0, MAX_CHARS);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
    const cut = sentence > TARGET_CHARS / 2 ? sentence + 1 : Math.max(window.lastIndexOf(" "), TARGET_CHARS);
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Groups a page's paragraphs up to the target size before splitting anything oversized. */
function chunkPageText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}|\n(?=- )/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter(Boolean);

  const grouped: string[] = [];
  let buffer = "";
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (buffer && buffer.length + paragraph.length + 1 > TARGET_CHARS) {
      grouped.push(buffer);
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n${paragraph}` : paragraph;
    }
  }
  if (buffer) grouped.push(buffer);
  return grouped.flatMap(splitLong);
}

export function chunkPages(pages: ParsedPage[], lead?: string): Chunk[] {
  // `source` distinguishes the title chunk and each page/heading group, so a fragment is only ever
  // folded into a passage it actually belongs with.
  const chunks: (Chunk & { source: string })[] = [];
  // The title and subtitle lead the source, so a topical search can match the document itself —
  // the same convention the seed corpus uses.
  if (lead?.trim()) chunks.push({ position: 0, pageNo: null, text: lead.trim(), source: "lead" });

  for (const [index, page] of pages.entries()) {
    const group = `${index}:${page.pageNo ?? ""}:${page.heading ?? ""}`;
    for (const body of chunkPageText(page.text)) {
      // A heading gives the passage its context once it is detached from the document.
      const text = page.heading && !body.startsWith(page.heading) ? `${page.heading}\n${body}` : body;
      const previous = chunks[chunks.length - 1];
      if (body.length < MIN_CHARS && previous?.source === group && previous.text.length + body.length <= MAX_CHARS) {
        // Too short to retrieve on its own, and it continues the passage before it: fold it in
        // rather than indexing a fragment. The heading is already on that passage.
        previous.text = `${previous.text}\n${body}`;
        continue;
      }
      chunks.push({ position: chunks.length, pageNo: page.pageNo, text, source: group });
    }
  }
  return chunks.map(({ source: _source, ...c }, position) => ({ ...c, position }));
}
