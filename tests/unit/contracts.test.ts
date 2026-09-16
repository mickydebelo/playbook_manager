import { describe, expect, it } from "vitest";
import { briefInputSchema, createPlaybookInputSchema, OBJECTIVE_MAX, updatePlaybookInputSchema } from "@/shared/contracts";
import { validBrief } from "../helpers/db";

describe("briefInputSchema", () => {
  it("accepts a complete brief and trims strings", () => {
    const parsed = briefInputSchema.parse({ ...validBrief, customerName: "  Northwind Engineering  " });
    expect(parsed.customerName).toBe("Northwind Engineering");
    expect(parsed.focusAreas).toEqual(["Business strategy"]);
  });

  it("requires customer name and objective (the design's validation message)", () => {
    const result = briefInputSchema.safeParse({ ...validBrief, customerName: "", objective: "   " });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("customerName");
    expect(paths).toContain("objective");
  });

  it(`caps the objective at ${OBJECTIVE_MAX} characters`, () => {
    expect(briefInputSchema.safeParse({ ...validBrief, objective: "x".repeat(OBJECTIVE_MAX) }).success).toBe(true);
    expect(briefInputSchema.safeParse({ ...validBrief, objective: "x".repeat(OBJECTIVE_MAX + 1) }).success).toBe(false);
  });

  it("rejects unknown industries, bad colours and malformed source URLs", () => {
    expect(briefInputSchema.safeParse({ ...validBrief, industry: "space" }).success).toBe(false);
    expect(briefInputSchema.safeParse({ ...validBrief, brandColor: "blue" }).success).toBe(false);
    expect(briefInputSchema.safeParse({ ...validBrief, sources: [{ title: "x", url: "not a url" }] }).success).toBe(false);
    expect(briefInputSchema.safeParse({ ...validBrief, sources: [{ title: "x", url: "" }] }).success).toBe(true);
  });

  it("defaults optional collections", () => {
    const parsed = briefInputSchema.parse({ customerName: "A", industry: "dm", sizeBand: "small", objective: "B" });
    expect(parsed.focusAreas).toEqual([]);
    expect(parsed.sources).toEqual([]);
    expect(parsed.brandColor).toBeNull();
  });
});

describe("createPlaybookInputSchema / updatePlaybookInputSchema", () => {
  it("allows an optional template id and title", () => {
    expect(createPlaybookInputSchema.safeParse({ ...validBrief, templateId: "not-a-uuid" }).success).toBe(false);
    expect(createPlaybookInputSchema.safeParse({ ...validBrief, title: "BIM standards" }).success).toBe(true);
  });
  it("rejects an empty patch and out-of-range stages", () => {
    expect(updatePlaybookInputSchema.safeParse({}).success).toBe(false);
    expect(updatePlaybookInputSchema.safeParse({ stage: 5 }).success).toBe(false);
    expect(updatePlaybookInputSchema.safeParse({ stage: 2 }).success).toBe(true);
  });
});
