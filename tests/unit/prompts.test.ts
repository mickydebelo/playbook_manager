import { describe, expect, it } from "vitest";
import { buildSystemPrompt, describeBrief, draftPrompt, outlinePrompt, regeneratePrompt, renderExcerpts, type BriefContext, type SourceExcerpt } from "@/server/ai/prompts/playbook";

const brief: BriefContext = {
  playbookTitle: "Digital transformation playbook",
  customerId: "11111111-1111-4111-8111-111111111111",
  customerName: "Sweco",
  industry: "aeco",
  sizeBand: "large",
  objective: "Adopt a common data environment across all regional offices, aligned to ISO 19650.",
  focusAreas: ["Document control", "Change management"],
  additionalContext: "They already run Autodesk Construction Cloud in two regions.",
  briefSources: [
    { kind: "doc", title: "Sweco digital strategy 2026", url: "https://intranet.example.com/strategy" },
    { kind: "link", title: "ISO 19650 overview", url: "https://www.iso.org/standard/68078.html" },
  ],
};

describe("buildSystemPrompt", () => {
  const system = buildSystemPrompt(brief, "draft");

  it("carries every field of the brief into the system prompt", () => {
    expect(system).toContain("Sweco");
    expect(system).toContain("AECO (Architecture, Engineering, Construction & Operations)");
    expect(system).toContain("Large");
    expect(system).toContain("10,000 – 50,000");
    expect(system).toContain(brief.objective);
    expect(system).toContain("Document control");
    expect(system).toContain("Change management");
    expect(system).toContain("Autodesk Construction Cloud in two regions");
  });

  it("includes the brief's source links, which were previously stored and never used", () => {
    expect(system).toContain("Sweco digital strategy 2026");
    expect(system).toContain("https://www.iso.org/standard/68078.html");
  });

  it("uses the labelled block structure the advisor prompt specifies", () => {
    for (const block of ["CUSTOMER CONTEXT", "BUSINESS OBJECTIVE", "FOCUS AREAS", "OPTIONAL CONTEXT / SOURCES", "INSTRUCTIONS", "TASK", "HOUSE STYLE"]) {
      expect(system).toContain(block);
    }
    expect(system.indexOf("CUSTOMER CONTEXT")).toBeLessThan(system.indexOf("INSTRUCTIONS"));
  });

  it("keeps the brand house-style rules that predate the rewrite", () => {
    expect(system).toContain("cutting edge, impactful, leverage, pain point, revolutionary, synergy, purpose-built");
    expect(system).toContain("Sentence case");
    expect(system).toContain("No emoji");
  });

  it("varies the task block by task and keeps the brief in all of them", () => {
    const outline = buildSystemPrompt(brief, "outline");
    const assistant = buildSystemPrompt(brief, "assistant");
    expect(outline).toContain("planning the chapter structure");
    expect(assistant).toContain("writing assistant");
    for (const s of [outline, assistant]) expect(s).toContain("Sweco");
  });

  it("states plainly when optional context is absent rather than leaving a blank", () => {
    const bare = buildSystemPrompt({ ...brief, additionalContext: "", briefSources: [], focusAreas: [] }, "draft");
    expect(bare).toContain("None supplied.");
    expect(bare).toContain("None selected.");
  });
});

describe("outlinePrompt", () => {
  it("names the focus areas that must be covered", () => {
    const p = outlinePrompt(brief);
    expect(p).toContain("Document control, Change management");
    expect(p).toContain("own chapter or its own section");
  });
  it("degrades sensibly with no focus areas", () => {
    expect(outlinePrompt({ ...brief, focusAreas: [] })).toContain("none listed");
  });
});

const excerpts: SourceExcerpt[] = [
  { n: 1, sourceTitle: "Document control best practices", ownerOrg: "Technical Advisory", year: 2023, pageNo: 4, text: "A naming convention works when it can be applied without judgement." },
  { n: 2, sourceTitle: "ISO 19650 guidance", ownerOrg: "External source", year: null, pageNo: null, text: "The standard defines the information delivery cycle." },
];

describe("excerpt rendering", () => {
  it("attributes each excerpt with owner, year and page when known", () => {
    const out = renderExcerpts(excerpts);
    expect(out).toContain("[1] Document control best practices (Technical Advisory, 2023, p. 4)");
    expect(out).toContain("[2] ISO 19650 guidance (External source)");
  });

  it("puts the excerpts in the draft prompt and tells the model to stay within them", () => {
    const p = draftPrompt({ sectionTitle: "Docs workflow", chapterTitle: "Project management", excerpts });
    expect(p).toContain("naming convention works");
    expect(p).toContain("do not introduce claims they do not support");
  });

  it("says so explicitly when no sources were selected", () => {
    const p = draftPrompt({ sectionTitle: "Docs workflow", chapterTitle: "Project management", excerpts: [] });
    expect(p).toContain("No sources were selected");
    expect(p).toContain("do not cite anything");
  });

  it("keeps the sources on a regenerate, which the previous version dropped", () => {
    const p = regeneratePrompt({ sectionTitle: "Docs workflow", current: "# Docs workflow\n\nOld text.", excerpts, instruction: "make it shorter" });
    expect(p).toContain("make it shorter");
    expect(p).toContain("naming convention works");
    expect(p).toContain("Old text.");
  });
});

describe("describeBrief", () => {
  it("omits optional lines when they are empty", () => {
    const out = describeBrief({ ...brief, focusAreas: [], additionalContext: "   " });
    expect(out).not.toContain("Focus areas:");
    expect(out).not.toContain("Additional context:");
    expect(out).toContain("Customer: Sweco");
  });
});
