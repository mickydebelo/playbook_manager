import { describe, expect, it } from "vitest";
import { createZip } from "@/server/modules/export/zip";
import { chunkPages } from "@/server/modules/ingest/chunk";
import { cleanText, decodeHtmlEntities } from "@/server/modules/ingest/clean-import-text";
import { ingestFileType, safeFileName, titleFromFileName } from "@/server/modules/ingest/file-types";
import { parseImportBuffer } from "@/server/modules/ingest/parse";
import { looksLikeProse } from "@/server/modules/ingest/parse-pdf";
import { openZip } from "@/server/modules/ingest/unzip";
import { docxFixture as docx, pdfFixture as pdf, pptxFixture as pptx } from "../helpers/documents";

describe("unzip", () => {
  it("reads back what the ZIP writer produced, stored and deflated alike", () => {
    const buf = createZip([
      { path: "stored.txt", data: "kept as-is", store: true },
      { path: "deflated.txt", data: "x".repeat(500) },
    ]);
    const zip = openZip(buf);
    expect(zip.names).toEqual(expect.arrayContaining(["stored.txt", "deflated.txt"]));
    expect(zip.text("stored.txt")).toBe("kept as-is");
    expect(zip.text("deflated.txt")).toHaveLength(500);
  });

  it("says a missing entry is absent rather than returning empty text", () => {
    expect(openZip(createZip([{ path: "a.txt", data: "a" }])).read("b.txt")).toBeNull();
  });

  it("refuses a file that is not an archive at all", () => {
    expect(() => openZip(Buffer.from("this is not a zip"))).toThrow(/not a ZIP file/i);
  });
});

describe("parseImportBuffer: docx", () => {
  it("keeps headings with the text that follows them", () => {
    const parsed = parseImportBuffer(
      docx([
        { text: "Document control handbook", style: "Title" },
        { text: "Naming conventions", style: "Heading1" },
        { text: "Every file carries a project code and a revision.", style: undefined },
        { text: "Approvals", style: "Heading1" },
        { text: "Two reviewers sign off each revision.", style: undefined },
      ]),
      "handbook.docx",
    );
    expect(parsed.error).toBeNull();
    expect(parsed.title).toBe("Document control handbook");
    expect(parsed.pages.map((p) => p.heading)).toEqual(["Naming conventions", "Approvals"]);
    expect(parsed.pages[0]!.text).toContain("project code");
    // Word has no pagination until it is laid out, so there is no page number to claim.
    expect(parsed.pages.every((p) => p.pageNo === null)).toBe(true);
  });

  it("finds the main part through the relationships, not by assuming its name", () => {
    // Word saved through some converters names it document2.xml; assuming document.xml read the
    // whole file as empty.
    const parsed = parseImportBuffer(docx([{ text: "Text in an unusually named part." }], "word/document2.xml"), "converted.docx");
    expect(parsed.error).toBeNull();
    expect(parsed.pages[0]!.text).toContain("unusually named part");
  });

  it("decodes entities, and drops anything that still looks like markup", () => {
    const parsed = parseImportBuffer(docx([{ text: "Revisions &amp; approvals for 2026" }]), "a.docx");
    expect(parsed.pages[0]!.text).toBe("Revisions & approvals for 2026");
    // A leaked tag cannot be told apart from an author writing <draft>, and in this corpus it is
    // always the former, so it is removed.
    const leaked = parseImportBuffer(docx([{ text: "Naming rules &lt;w:tbl&gt; apply per project" }]), "a.docx");
    expect(leaked.pages[0]!.text).toBe("Naming rules apply per project");
  });
});

describe("parseImportBuffer: pptx", () => {
  it("returns one passage per visible slide, numbered", () => {
    const parsed = parseImportBuffer(pptx([["Agenda", "Why now"], ["Rollout plan", "Three regions"]]), "deck.pptx");
    expect(parsed.pages.map((p) => p.pageNo)).toEqual([1, 2]);
    expect(parsed.pages[1]!.heading).toBe("Rollout plan");
    expect(parsed.pages[1]!.text).toContain("Three regions");
  });

  it("skips hidden slides, which are not part of the deck's argument", () => {
    const parsed = parseImportBuffer(pptx([["Shown"], ["Backup detail"]], [2]), "deck.pptx");
    expect(parsed.pages.map((p) => p.heading)).toEqual(["Shown"]);
  });
});

describe("parseImportBuffer: pdf", () => {
  it("extracts text per page so a citation can name the page", () => {
    const parsed = parseImportBuffer(pdf(["Audit trails record who changed a document.", "Naming conventions follow ISO 19650."]), "guide.pdf");
    expect(parsed.error).toBeNull();
    expect(parsed.pages.map((p) => p.pageNo)).toEqual([1, 2]);
    expect(parsed.pages[0]!.text).toContain("Audit trails record");
    expect(parsed.pages[1]!.text).toContain("ISO 19650");
    expect(parsed.pageCount).toBe(2);
  });

  it("inflates compressed content streams", () => {
    const parsed = parseImportBuffer(pdf(["Compressed page text about change management."], { compress: "zlib" }), "guide.pdf");
    expect(parsed.pages[0]!.text).toContain("change management");
  });

  it("recovers a raw deflate stream, which some producers write instead of zlib", () => {
    const parsed = parseImportBuffer(pdf(["Raw deflate page about document control."], { compress: "raw" }), "guide.pdf");
    expect(parsed.pages[0]!.text).toContain("document control");
  });

  it("reports an unreadable file instead of indexing nothing", () => {
    const parsed = parseImportBuffer(Buffer.from("%PDF-1.4\ntrailer\n%%EOF\n", "latin1"), "empty.pdf");
    expect(parsed.pages).toEqual([]);
    expect(parsed.error).toMatch(/no readable text .* OCR/is);
  });

  it("rejects a file type it cannot parse", () => {
    expect(parseImportBuffer(Buffer.from("hello"), "notes.txt").error).toMatch(/not a PDF, Word or PowerPoint/);
  });
});

describe("looksLikeProse", () => {
  it("accepts prose, including prose with diacritics", () => {
    expect(looksLikeProse("Audit trails record who changed a controlled document and when.")).toBe(true);
    expect(looksLikeProse("Umowa o świadczenie usług zakwaterowania zawarta pomiędzy stronami niniejszej umowy.")).toBe(true);
  });

  it("rejects the mojibake a wrongly-mapped subset font produces", () => {
    // Taken from reading a Chrome-printed PDF back: the letter ratio is high, so only the word
    // shape gives it away.
    expect(looksLikeProse("Í ) S b W 6 Í a ¡ Ñ À ß · Z å Ý À å ß Z ó å Ý Z ï À Ñ å Z å Z ï ó å §")).toBe(false);
  });

  it("rejects text too short to judge", () => {
    expect(looksLikeProse("Page 1")).toBe(false);
  });
});

describe("chunkPages", () => {
  const page = (pageNo: number | null, text: string, heading: string | null = null) => ({ pageNo, heading, text });

  it("leads with the title so a topical search can match the document itself", () => {
    const chunks = chunkPages([page(1, "Body text about audit trails.".repeat(6))], "Handbook. Document control");
    expect(chunks[0]!.text).toBe("Handbook. Document control");
    expect(chunks[0]!.pageNo).toBeNull();
  });

  it("keeps the page number on every passage it produces", () => {
    const chunks = chunkPages([page(4, "A".repeat(2000)), page(5, "Short but sufficient page of text about approvals.".repeat(4))]);
    expect(chunks.length).toBeGreaterThan(2);
    expect(new Set(chunks.map((c) => c.pageNo))).toEqual(new Set([4, 5]));
  });

  it("splits oversized text and numbers the chunks in order", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} about document control and revision handling. `.repeat(4)).join("\n\n");
    const chunks = chunkPages([page(1, long)]);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
    expect(Math.max(...chunks.map((c) => c.text.length))).toBeLessThanOrEqual(1400);
  });

  it("carries the heading into the passage, so a detached excerpt still has context", () => {
    const chunks = chunkPages([page(null, "Two reviewers sign off each revision of a controlled document.", "Approvals")]);
    expect(chunks[0]!.text.startsWith("Approvals")).toBe(true);
  });

  it("folds a fragment into the previous passage instead of indexing it alone", () => {
    const chunks = chunkPages([page(2, `${"Substantial paragraph about naming conventions. ".repeat(6)}\n\nSee annex B.`)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("See annex B.");
  });
});

describe("filename handling", () => {
  it("refuses to let a filename walk out of the storage prefix", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd"); // only the basename survives
    expect(safeFileName("C:\\Users\\me\\report.docx")).toBe("report.docx");
    expect(safeFileName("")).toBe("upload");
  });

  it("derives a readable title and a type from the name", () => {
    expect(titleFromFileName("document_control-handbook.DOCX")).toBe("Document control handbook");
    expect(ingestFileType("deck.pptx")).toBe("pptx");
    expect(ingestFileType("sheet.xlsx")).toBeNull();
  });
});

describe("clean-import-text", () => {
  it("decodes ampersands last, so &amp;lt; does not become a tag", () => {
    expect(decodeHtmlEntities("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;");
    expect(decodeHtmlEntities("&#65;&#x42;")).toBe("AB");
  });

  it("leaves clean prose untouched", () => {
    const prose = "Audit trails record who changed a document and when.";
    expect(cleanText(prose)).toBe(prose);
  });
});
