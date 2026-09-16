import { describe, expect, it } from "vitest";
import { renderPlaybookDocx } from "@/server/modules/export/docx";
import type { RenderInput } from "@/server/modules/export/render-html";
import { openZip } from "@/server/modules/ingest/unzip";

const input: RenderInput = {
  title: "Vellum Aerostructures design automation playbook",
  customerName: "Vellum Aerostructures",
  industry: "dm",
  subtitle: "Cut engineering change order cycle time in half.",
  version: "1.0",
  date: "September 2026",
  draft: true,
  chapters: [
    {
      title: "Design automation",
      number: "1.",
      sections: [
        { title: "Consolidating two legacy tools", number: "1.1", contentMd: "# Consolidating two legacy tools\n\nOne paragraph.\n\n- a bullet" },
        { title: "Not drafted yet", number: "1.2", contentMd: "" },
      ],
    },
  ],
  sources: [{ title: "Workflow guide", ownerOrg: "Autodesk", year: 2026 }],
};

describe("renderPlaybookDocx", () => {
  const zip = openZip(renderPlaybookDocx(input));

  it("produces the parts Word needs, and nothing it does not understand", () => {
    expect(zip.names).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/core.xml",
        "word/document.xml",
        "word/styles.xml",
        "word/numbering.xml",
        "word/footer1.xml",
      ]),
    );
  });

  it("carries a footer with a page-number field, declared everywhere it has to be", () => {
    const footer = zip.text("word/footer1.xml") ?? "";
    // The number is a field because the generator cannot know where pages will fall.
    expect(footer).toContain("PAGE");
    expect(footer).toContain("fldChar");
    expect(footer).toContain("Vellum Aerostructures design automation playbook · Draft");

    // A part Word cannot resolve makes it refuse the whole file, so all three links must exist.
    expect(zip.text("word/document.xml")).toContain('<w:footerReference w:type="default" r:id="rId3"/>');
    expect(zip.text("word/_rels/document.xml.rels")).toContain('Target="footer1.xml"');
    expect(zip.text("[Content_Types].xml")).toContain("/word/footer1.xml");
    // footerReference is in the relationships namespace, which the document must declare.
    expect(zip.text("word/document.xml")).toContain('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  });

  it("writes the document text, dropping a section's repeated title", () => {
    const doc = zip.text("word/document.xml") ?? "";
    expect(doc).toContain("One paragraph.");
    expect(doc).toContain("a bullet");
    expect(doc).toContain("This section has not been drafted yet.");
    expect(doc.match(/Consolidating two legacy tools/g)).toHaveLength(2); // contents row + section heading
    expect(doc).toContain("Workflow guide");
  });
});
