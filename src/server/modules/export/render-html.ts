import { escapeHtml, parseMarkdown } from "@/shared/markdown";
import { INDUSTRY_SHORT, type Industry } from "@/shared/enums";
import { webAssets, type DocumentAssets } from "./assets";

/**
 * The single document renderer. It produces the printable HTML used for the in-app document
 * preview and, printed through headless Chrome, for the PDF export — so the two cannot drift.
 *
 * Layout follows the design's review screen: a dark-accented cover, a contents page, then one
 * page per section.
 */
export type RenderSection = { title: string; number: string; contentMd: string };
export type RenderChapter = { title: string; number: string; sections: RenderSection[] };

export type RenderInput = {
  title: string;
  customerName: string;
  industry: Industry;
  subtitle: string;
  version: string;
  date: string;
  chapters: RenderChapter[];
  /** Cited sources, appended as a final page when the export asks for them. */
  sources?: { title: string; ownerOrg: string; year: number | null }[];
  /** Brand images and fonts. Relative URLs for the preview, data URIs for the printed PDF. */
  assets?: DocumentAssets;
  draft?: boolean;
};

/** Print stylesheet. A4 with the design's typography; also used on screen inside the preview iframe. */
function styles(assets: DocumentAssets): string {
  return `
${assets.fonts
  .map(
    (f) =>
      `@font-face { font-family: '${f.family}'; src: url('${f.url}') format('opentype'); font-weight: ${f.weight}; font-style: normal; font-display: block; }`,
  )
  .join("\n")}
@page { size: A4; margin: 18mm 16mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Artifakt Element', Arial, sans-serif;
  color: #000; font-size: 11pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
/* The @page margins above only apply when Chrome prints the PDF; browsers ignore them on screen,
   so the in-app preview iframe would render edge-to-edge. Mirror them as padding for screen media
   only, so the preview matches the exported document without changing the print output. */
@media screen { body { padding: 18mm 16mm 16mm; } }
h1, h2, h3 { font-family: 'Artifakt Legend', Arial, sans-serif; font-weight: 700; margin: 0; text-wrap: pretty; }
p { margin: 0 0 10pt; text-wrap: pretty; }
ul { margin: 0 0 10pt; padding-left: 16pt; }
li { margin-bottom: 4pt; }
.page { page-break-after: always; break-after: page; position: relative; min-height: 247mm; }
.page:last-child { page-break-after: auto; break-after: auto; }

.cover { display: flex; flex-direction: column; height: 247mm; overflow: hidden; }
.cover-top { display: flex; justify-content: space-between; align-items: center; font-size: 8pt; color: #666; }
.cover-logo { height: 14pt; }
.cover-body { margin-top: 26%; max-width: 62%; }
.cover-title { font-size: 30pt; line-height: 1.1; }
.cover-title mark { background: #ffff00; padding: 0 4pt; }
.cover-sub { margin-top: 10pt; font-size: 11pt; max-width: 90%; }
.cover-art { position: absolute; right: -8%; bottom: 16%; width: 52%; aspect-ratio: 1; object-fit: cover;
  clip-path: polygon(35% 0, 100% 0, 100% 100%, 0 100%); }
.cover-foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 8pt; color: #666; }
.rule { width: 28pt; height: 2pt; background: #000; margin-bottom: 10pt; }

.toc h2 { font-size: 18pt; margin-bottom: 14pt; }
.toc-row { display: flex; gap: 8pt; align-items: baseline; padding: 5pt 0; border-bottom: 1px solid #e8e8e8; font-size: 10pt; }
.toc-row .n { color: #666; min-width: 28pt; }
.toc-row .t { flex: 1; }
.toc-row.section { padding-left: 28pt; }
.toc-row.section .t { color: #333; }

.chapter-open h2 { font-size: 22pt; }
.chapter-open .eyebrow { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #666; margin-bottom: 8pt; }
.section h2 { font-size: 15pt; margin-bottom: 4pt; }
.section h3 { font-size: 11pt; margin: 12pt 0 4pt; }
.section .eyebrow { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #666; margin-bottom: 6pt; }
.sources h2 { font-size: 18pt; margin-bottom: 12pt; }
.sources li { font-size: 10pt; }
.empty { color: #666; font-style: italic; }
`.trim();
}

function renderBody(contentMd: string, sectionTitle: string): string {
  const blocks = parseMarkdown(contentMd);
  if (!blocks.length) return `<p class="empty">This section has not been drafted yet.</p>`;
  return blocks
    .map((b) => {
      switch (b.type) {
        // The section title is already rendered as the page heading, so a repeated '# ' is dropped.
        case "h1":
          return b.text.trim() === sectionTitle.trim() ? "" : `<h2>${escapeHtml(b.text)}</h2>`;
        case "h2":
          return `<h3>${escapeHtml(b.text)}</h3>`;
        case "ul":
          return `<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        default:
          return `<p>${escapeHtml(b.text)}</p>`;
      }
    })
    .filter(Boolean)
    .join("\n");
}

export function renderPlaybookHtml(input: RenderInput): string {
  const assets = input.assets ?? webAssets();
  const logo = assets.logo;
  const art = assets.art;

  const cover = `
<section class="page cover">
  <div class="cover-top"><img class="cover-logo" src="${logo}" alt="Autodesk"><span>Confidential${input.draft ? " · Draft" : ""}</span></div>
  <div class="cover-body">
    <div class="rule"></div>
    <h1 class="cover-title">${escapeHtml(input.title)}</h1>
    <div class="cover-sub">${escapeHtml(input.subtitle)}</div>
  </div>
  <img class="cover-art" src="${art}" alt="">
  <div class="cover-foot"><span>${escapeHtml(input.date)}</span><span>Version ${escapeHtml(input.version)}</span></div>
</section>`;

  const toc = `
<section class="page toc">
  <h2>Contents</h2>
  ${input.chapters
    .map(
      (c) =>
        `<div class="toc-row"><span class="n">${escapeHtml(c.number)}</span><span class="t">${escapeHtml(c.title)}</span></div>` +
        c.sections
          .map((sec) => `<div class="toc-row section"><span class="n">${escapeHtml(sec.number)}</span><span class="t">${escapeHtml(sec.title)}</span></div>`)
          .join(""),
    )
    .join("")}
</section>`;

  const body = input.chapters
    .map((c) => {
      const opener = `
<section class="page chapter-open">
  <div class="eyebrow">Chapter ${escapeHtml(c.number.replace(/\.$/, ""))}</div>
  <div class="rule"></div>
  <h2>${escapeHtml(c.title)}</h2>
</section>`;
      const sections = c.sections
        .map(
          (sec) => `
<section class="page section">
  <div class="eyebrow">${escapeHtml(c.title)}</div>
  <h2>${escapeHtml(sec.number)} ${escapeHtml(sec.title)}</h2>
  ${renderBody(sec.contentMd, sec.title)}
</section>`,
        )
        .join("");
      return opener + sections;
    })
    .join("");

  const sources = input.sources?.length
    ? `
<section class="page sources">
  <h2>Sources</h2>
  <ul>${input.sources
    .map((s) => `<li>${escapeHtml(s.title)} — ${escapeHtml(s.ownerOrg)}${s.year ? `, ${s.year}` : ""}</li>`)
    .join("")}</ul>
</section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)}</title>
<style>${styles(assets)}</style>
</head>
<body>
${cover}
${toc}
${body}
${sources}
</body>
</html>`;
}

/** The cover subtitle the design shows: the first sentence of the objective. */
export function coverSubtitle(objective: string, customerName: string, industry: Industry): string {
  const first = objective.trim().split(". ")[0]?.replace(/\.$/, "");
  return first ? `${first}.` : `A tailored ${INDUSTRY_SHORT[industry]} plan for ${customerName}.`;
}
