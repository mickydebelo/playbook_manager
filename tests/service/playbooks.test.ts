import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collaborators } from "@/server/db/schema";
import { archivePlaybook, createPlaybook, duplicatePlaybook, getPlaybook, listPlaybooks, replaceBrief, updatePlaybook } from "@/server/modules/playbooks/service";
import { AppError } from "@/server/http/errors";
import { createTestContext, destroyTestContext, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await destroyTestContext(ctx);
});

describe("playbooks service", () => {
  it("creates a playbook with customer, brief and sources in one go", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, validBrief);
    expect(pb.title).toBe("Digital transformation playbook");
    expect(pb.status).toBe("draft");
    expect(pb.stage).toBe(1);
    expect(pb.customer.name).toBe("Northwind Engineering");
    expect(pb.customer.industry).toBe("aeco");
    expect(pb.brief.objective).toBe(validBrief.objective);
    expect(pb.brief.sources).toHaveLength(1);
    expect(pb.brief.sources[0]!.url).toBe("https://www.autodesk.com/products");
    expect(pb.permissions).toEqual({ canEdit: true, canManage: true });
    expect(pb.outline).toEqual([]);
  });

  it("reuses a customer by case-insensitive name and refreshes its facts", async () => {
    const first = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Harbor & Vale", sizeBand: "small" });
    const second = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "harbor & vale", sizeBand: "enterprise" });
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.sizeBand).toBe("enterprise");
  });

  it("materialises the outline and merges focus areas when created from a template", async () => {
    const { templates } = await import("@/server/db/schema");
    const [dt] = await ctx.db.select().from(templates).where((await import("drizzle-orm")).eq(templates.title, "Digital transformation"));
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, focusAreas: ["Project management"], templateId: dt!.id });
    expect(pb.outline.map((c) => c.title)).toContain("Business Strategy");
    expect(pb.outline.find((c) => c.title === "Project Management")!.sections.map((s) => s.title)).toEqual(["Project Setup", "Docs Workflow", "Build Workflow", "Adoption & KPIs"]);
    expect(pb.brief.focusAreas).toEqual(["Business strategy", "Change management", "Project management"]);
    expect(pb.title).toBe("Digital transformation playbook");
  });

  it("lists only what the caller can see, newest first, hiding archived by default", async () => {
    const mine = await listPlaybooks(ctx.db, ctx.author);
    expect(mine.length).toBeGreaterThanOrEqual(4);
    expect(new Date(mine[0]!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(mine[mine.length - 1]!.updatedAt).getTime());
    expect(await listPlaybooks(ctx.db, ctx.outsider)).toEqual([]);
    // admin sees everything
    expect((await listPlaybooks(ctx.db, ctx.admin)).length).toBe(mine.length);
  });

  it("filters by status", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Studio Lark" });
    await updatePlaybook(ctx.db, ctx.author, pb.id, { status: "in_review" });
    const inReview = await listPlaybooks(ctx.db, ctx.author, { status: "in_review" });
    expect(inReview.map((p) => p.id)).toContain(pb.id);
    expect((await listPlaybooks(ctx.db, ctx.author, { status: "delivered" })).map((p) => p.id)).not.toContain(pb.id);
  });

  it("denies access to strangers and enforces collaborator roles", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Cobalt Infrastructure" });
    await expect(getPlaybook(ctx.db, ctx.outsider, pb.id)).rejects.toMatchObject({ code: "forbidden" });

    await ctx.db.insert(collaborators).values({ playbookId: pb.id, userId: ctx.outsider.id, role: "reviewer", invitedBy: ctx.author.id });
    const asReviewer = await getPlaybook(ctx.db, ctx.outsider, pb.id);
    expect(asReviewer.permissions).toEqual({ canEdit: false, canManage: false });
    expect(asReviewer.collaborators[0]).toMatchObject({ userId: ctx.outsider.id, role: "reviewer" });
    await expect(replaceBrief(ctx.db, ctx.outsider, pb.id, validBrief)).rejects.toMatchObject({ code: "forbidden" });
    await expect(updatePlaybook(ctx.db, ctx.outsider, pb.id, { status: "delivered" })).rejects.toMatchObject({ code: "forbidden" });
    // reviewers may still see it in their list
    expect((await listPlaybooks(ctx.db, ctx.outsider)).map((p) => p.id)).toContain(pb.id);
  });

  it("replaces the brief and its sources, touching updated_at", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Meridian Manufacturing" });
    const before = pb.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await replaceBrief(ctx.db, ctx.author, pb.id, {
      ...validBrief,
      customerName: "Meridian Manufacturing",
      industry: "dm",
      objective: "Scale design automation.",
      focusAreas: ["Design automation", "design automation", "Governance"],
      sources: [],
    });
    expect(updated.brief.objective).toBe("Scale design automation.");
    expect(updated.brief.focusAreas).toEqual(["Design automation", "Governance"]);
    expect(updated.brief.sources).toEqual([]);
    expect(updated.customer.industry).toBe("dm");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("moves through stages, forces stage 4 on delivery and refuses PATCH status=archived", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Stage Co" });
    expect((await updatePlaybook(ctx.db, ctx.author, pb.id, { stage: 2 })).stage).toBe(2);
    expect((await updatePlaybook(ctx.db, ctx.author, pb.id, { title: "Renamed" })).title).toBe("Renamed");
    const delivered = await updatePlaybook(ctx.db, ctx.author, pb.id, { status: "delivered" });
    expect(delivered.status).toBe("delivered");
    expect(delivered.stage).toBe(4);
    await expect(updatePlaybook(ctx.db, ctx.author, pb.id, { status: "archived" })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("duplicates brief, sources and outline into a new draft owned by the caller", async () => {
    const { templates } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const [dt] = await ctx.db.select().from(templates).where(eq(templates.title, "Digital transformation"));
    const original = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Dup Co", templateId: dt!.id });
    await updatePlaybook(ctx.db, ctx.author, original.id, { stage: 3 });
    const copy = await duplicatePlaybook(ctx.db, ctx.admin, original.id);
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe("Copy of Digital transformation playbook");
    expect(copy.ownerId).toBe(ctx.admin.id);
    expect(copy.status).toBe("draft");
    expect(copy.stage).toBe(3);
    expect(copy.brief.sources).toHaveLength(1);
    expect(copy.outline.length).toBe(original.outline.length);
    expect(copy.outline[1]!.sections.map((s) => s.title)).toEqual(original.outline[1]!.sections.map((s) => s.title));
  });

  it("archives (soft delete) and then refuses edits", async () => {
    const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Archive Co" });
    await expect(archivePlaybook(ctx.db, ctx.outsider, pb.id)).rejects.toBeInstanceOf(AppError);
    await archivePlaybook(ctx.db, ctx.author, pb.id);
    expect((await listPlaybooks(ctx.db, ctx.author)).map((p) => p.id)).not.toContain(pb.id);
    expect((await listPlaybooks(ctx.db, ctx.author, { status: "archived" })).map((p) => p.id)).toContain(pb.id);
    await expect(replaceBrief(ctx.db, ctx.author, pb.id, validBrief)).rejects.toMatchObject({ code: "conflict" });
    await archivePlaybook(ctx.db, ctx.author, pb.id); // idempotent
  });

  it("returns not_found for unknown ids", async () => {
    await expect(getPlaybook(ctx.db, ctx.author, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "not_found" });
  });
});
