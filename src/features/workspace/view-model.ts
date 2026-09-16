import type { PlaybookDetail, SectionCandidateDto } from "@/shared/contracts";
import type { BadgeTone } from "@/components/ds";

/** Presentation constants for source type chips, unchanged from the design. */
export const TYPE: Record<string, { label: string; bg: string; color: string }> = {
  pdf: { label: "PDF", bg: "var(--dusk-100)", color: "var(--dusk-700)" },
  docx: { label: "W", bg: "var(--twilight-100)", color: "var(--twilight-700)" },
  pptx: { label: "P", bg: "var(--dawn-100)", color: "var(--dawn-700)" },
  link: { label: "URL", bg: "var(--slate-100)", color: "var(--adsk-black)" },
};

export type Tag = { label: string; tone: BadgeTone };

/** The design's badge set, derived from stored fields rather than stored as display strings. */
export function tagsForSource(
  s: { status: string; currency: string; isExternal: boolean; customerId?: string | null; indexedAt?: string | null },
  relevance?: string,
): Tag[] {
  const tags: Tag[] = [];
  // A document ingested for one customer is confidential to them, and retrieval enforces it.
  if (s.customerId) tags.push({ label: "Customer-specific", tone: "warning" });
  // Ingest creates the row before the text exists, so say which state it is actually in.
  if (s.indexedAt === null && s.status === "draft") tags.push({ label: "Indexing", tone: "info" });
  if (s.status === "approved") tags.push({ label: "Approved", tone: "positive" });
  if (s.status === "draft") tags.push({ label: "Unreviewed", tone: "neutral" });
  if (s.currency === "current") tags.push({ label: "Current", tone: "info" });
  else tags.push({ label: "Older version", tone: "neutral" });
  if (s.isExternal) tags.push({ label: "External source", tone: "neutral" });
  if (relevance === "high") tags.push({ label: "High relevance", tone: "info" });
  if (relevance === "medium") tags.push({ label: "Medium relevance", tone: "warning" });
  if (relevance === "low") tags.push({ label: "Low relevance", tone: "critical" });
  return tags;
}

export type FlatNode = {
  key: string;
  kind: "chapter" | "section";
  chapterId: string;
  sectionId: string | null;
  n: string;
  title: string;
  coverage: "none" | "thin" | "ok";
  sourceCount: number;
  wordCount: number;
  childCount: number;
};

/** Chapters numbered "1.", sections "1.1" — the numbering the design shows. */
export function flattenOutline(detail: PlaybookDetail | null): FlatNode[] {
  if (!detail) return [];
  const out: FlatNode[] = [];
  detail.outline.forEach((chapter, ci) => {
    const sourceCount = chapter.sections.reduce((a, s) => a + s.sourceCount, 0);
    const coverage = worstCoverage(chapter.sections.map((s) => s.coverage));
    out.push({
      key: chapter.id,
      kind: "chapter",
      chapterId: chapter.id,
      sectionId: chapter.sections[0]?.id ?? null,
      n: `${ci + 1}.`,
      title: chapter.title,
      coverage,
      sourceCount,
      wordCount: chapter.sections.reduce((a, s) => a + s.wordCount, 0),
      childCount: chapter.sections.length,
    });
    chapter.sections.forEach((section, si) => {
      out.push({
        key: section.id,
        kind: "section",
        chapterId: chapter.id,
        sectionId: section.id,
        n: `${ci + 1}.${si + 1}`,
        title: section.title,
        coverage: section.coverage,
        sourceCount: section.sourceCount,
        wordCount: section.wordCount,
        childCount: 0,
      });
    });
  });
  return out;
}

function worstCoverage(list: ("none" | "thin" | "ok")[]): "none" | "thin" | "ok" {
  if (!list.length) return "none";
  if (list.includes("none")) return "none";
  if (list.includes("thin")) return "thin";
  return "ok";
}

export function coverageColor(c: "none" | "thin" | "ok"): string {
  return c === "ok" ? "var(--morning-600)" : c === "thin" ? "var(--dawn)" : "var(--slate-300)";
}

export function candidateView(c: SectionCandidateDto) {
  const type = TYPE[c.type] ?? TYPE.link!;
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    subtitle: c.subtitle,
    org: c.ownerOrg,
    year: c.year ? String(c.year) : "",
    pages: c.pageCount ?? 1,
    usedIn: c.usedIn,
    url: c.url,
    relevantFor: c.relevantFor,
    tags: tagsForSource(c, c.relevance),
    typeLabel: type.label,
    typeBg: type.bg,
    typeColor: type.color,
  };
}

/** Words too common to be worth highlighting in a matched passage. */
const TOPIC_STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "that", "this", "into", "their", "your", "our", "across", "through",
  "have", "will", "which", "where", "when", "what", "how", "are", "was", "were", "been", "being", "than",
  "then", "them", "they", "its", "it's", "not", "but", "all", "any", "can", "how", "more", "most", "such",
  "each", "also", "both", "over", "under", "between", "while", "during", "every", "other", "some", "only",
]);

/**
 * Splits a matched passage into plain and highlighted runs, so the preview can show *why* a source
 * was proposed. Returning segments rather than HTML keeps the text escaped by React.
 */
export function highlightTerms(text: string, topic: string): { text: string; hit: boolean }[] {
  const terms = [
    ...new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !TOPIC_STOPWORDS.has(w)),
    ),
  ].slice(0, 40);
  if (!terms.length) return [{ text, hit: false }];

  const pattern = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*\\b`, "gi");
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), hit: false });
    out.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

/** Markdown blocks for the step-3 formatted view. */
export type Block = { type: "h1" | "h2" | "p" | "ul"; text?: string; items?: string[]; isH1: boolean; isH2: boolean; isP: boolean; isUl: boolean };

export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  let ul: Block | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      ul = null;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!ul) {
        ul = { type: "ul", items: [], isH1: false, isH2: false, isP: false, isUl: true };
        out.push(ul);
      }
      ul.items!.push(line.slice(2));
      continue;
    }
    ul = null;
    if (line.startsWith("## ")) out.push({ type: "h2", text: line.slice(3), isH1: false, isH2: true, isP: false, isUl: false });
    else if (line.startsWith("# ")) out.push({ type: "h1", text: line.slice(2), isH1: true, isH2: false, isP: false, isUl: false });
    else out.push({ type: "p", text: line, isH1: false, isH2: false, isP: true, isUl: false });
  }
  return out;
}

export function countWords(markdown: string): number {
  return markdown.replace(/[#>*_`-]/g, " ").split(/\s+/).filter(Boolean).length;
}

/** "Saved just now" / "Last saved 4 minutes ago" for the editor header. */
export function savedLabel(iso: string | null): string {
  if (!iso) return "Not saved yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "Saved just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Last saved ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `Last saved ${hours} hour${hours === 1 ? "" : "s"} ago`;
}
