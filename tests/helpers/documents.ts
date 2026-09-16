import { deflateRawSync, deflateSync } from "node:zlib";
import { createZip } from "@/server/modules/export/zip";

/**
 * Synthetic but genuine documents: a real ZIP of real OOXML parts, and a real PDF object graph.
 * Built rather than committed as binaries so a test says what is in the file it is asserting on.
 */
export function docxFixture(paragraphs: { text: string; style?: string }[], part = "word/document.xml"): Buffer {
  const body = paragraphs
    .map((p) => `<w:p>${p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${p.text}</w:t></w:r></w:p>`)
    .join("");
  return createZip([
    { path: "[Content_Types].xml", data: `<?xml version="1.0"?><Types/>` },
    {
      path: "_rels/.rels",
      data: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`,
    },
    { path: part, data: `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>` },
  ]);
}

export function pptxFixture(slides: string[][], hidden: number[] = []): Buffer {
  const entries = slides.map((lines, i) => ({
    path: `ppt/slides/slide${i + 1}.xml`,
    data: `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>${lines
      .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
      .join("")}</p:spTree></p:cSld></p:sld>`,
  }));
  const rels = slides.map((_, i) => `<Relationship Id="rId${i + 1}" Target="slides/slide${i + 1}.xml"/>`).join("");
  const sldIds = slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"${hidden.includes(i + 1) ? ` show="0"` : ""}/>`)
    .join("");
  return createZip([
    ...entries,
    { path: "ppt/_rels/presentation.xml.rels", data: `<?xml version="1.0"?><Relationships>${rels}</Relationships>` },
    { path: "ppt/presentation.xml", data: `<?xml version="1.0"?><p:presentation><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>` },
  ]);
}

export function pdfFixture(pages: string[], opts: { compress?: "zlib" | "raw" } = {}): Buffer {
  const objects: string[] = [];
  const contentFirst = 3 + pages.length;
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i} 0 R`).join(" ")}] >>\nendobj\n`);
  pages.forEach((_, i) => {
    objects.push(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /Contents ${contentFirst + i} 0 R >>\nendobj\n`);
  });

  const parts: Buffer[] = [Buffer.from(`%PDF-1.4\n`, "latin1"), ...objects.map((o) => Buffer.from(o, "latin1"))];
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET\n`;
    const raw = Buffer.from(stream, "latin1");
    const data = opts.compress === "zlib" ? deflateSync(raw) : opts.compress === "raw" ? deflateRawSync(raw) : raw;
    const filter = opts.compress ? " /Filter /FlateDecode" : "";
    parts.push(
      Buffer.concat([
        Buffer.from(`${contentFirst + i} 0 obj\n<< /Length ${data.length}${filter} >>\nstream\n`, "latin1"),
        data,
        Buffer.from(`\nendstream\nendobj\n`, "latin1"),
      ]),
    );
  });
  parts.push(Buffer.from(`trailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

/** Storage that keeps files in memory, so a test can exercise the whole store-then-parse path. */
export function memoryStorage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    driver: {
      put: async (key: string, data: Buffer) => void files.set(key, data),
      get: async (key: string) => {
        const hit = files.get(key);
        if (!hit) throw new Error(`No stored file at ${key}`);
        return hit;
      },
      remove: async (key: string) => void files.delete(key),
    },
  };
}
