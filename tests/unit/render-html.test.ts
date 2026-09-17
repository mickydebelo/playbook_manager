import { describe, expect, it } from "vitest";
import { inlineAssets, webAssets } from "@/server/modules/export/assets";
import { renderPlaybookHtml, type RenderInput } from "@/server/modules/export/render-html";

const input: RenderInput = {
  title: "Vellum Aerostructures design automation playbook",
  customerName: "Vellum Aerostructures",
  industry: "dm",
  subtitle: "Cut engineering change order cycle time in half.",
  version: "1.0",
  date: "September 2026",
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
};

describe("renderPlaybookHtml", () => {
  it("renders a cover, a contents page and one page per chapter opener and section", () => {
    const html = renderPlaybookHtml(input);
    const pages = html.match(/<section class="page/g) ?? [];
    // cover + contents + chapter opener + two sections
    expect(pages).toHaveLength(5);
    expect(html).toContain("Contents");
    expect(html).toContain("@page");
    expect(html).toContain("Vellum Aerostructures design automation playbook");
  });

  it("drops a section's repeated h1 title and marks an undrafted section", () => {
    const html = renderPlaybookHtml(input);
    expect(html).toContain("<li>a bullet</li>");
    // The '# ' heading repeats the page heading, so it must not render twice.
    expect(html.match(/Consolidating two legacy tools/g)).toHaveLength(2); // contents row + page heading
    expect(html).toContain("This section has not been drafted yet.");
  });

  it("declares the Artifakt faces so the document does not silently fall back to Arial", () => {
    const html = renderPlaybookHtml(input);
    expect(html).toContain("@font-face");
    expect(html).toContain("Artifakt Legend");
    expect(html).toContain("Artifakt Element");
  });

  it("references same-origin asset paths for the in-app preview", () => {
    const html = renderPlaybookHtml({ ...input, assets: webAssets() });
    expect(html).toContain('src="/brand/autodesk-logo.png"');
    expect(html).toContain("/fonts/ArtifaktElement-Regular.otf");
  });

  it("puts a customer logo on the cover in place of the default brand mark", () => {
    // Preview path: a served URL. Print path would instead pass a data: URI; both flow through here.
    const html = renderPlaybookHtml({ ...input, assets: { ...webAssets(), logo: "/api/assets/logo-123" } });
    expect(html).toContain('class="cover-logo" src="/api/assets/logo-123"');
    expect(html).not.toContain('src="/brand/autodesk-logo.png"');
  });

  /**
   * The PDF is printed from a temporary file:// page. Any root-relative asset URL resolves to
   * file:///brand/... there and prints as a broken image, which is how the cover lost its logo.
   */
  it("inlines every asset for the printed PDF, leaving no root-relative URL to break under file://", async () => {
    const html = renderPlaybookHtml({ ...input, assets: await inlineAssets() });
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("data:image/jpeg;base64,");
    expect(html).toContain("data:font/otf;base64,");
    expect(html).not.toMatch(/src="\/brand/);
    expect(html).not.toMatch(/url\('\/fonts/);
  });
});
