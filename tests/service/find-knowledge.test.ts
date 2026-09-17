import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chapters, sections } from "@/server/db/schema";
import { isAiConfigured } from "@/server/ai/aps-client";
import { findKnowledgeHandler } from "@/server/modules/jobs/handlers/find-knowledge";
import { enqueueJob } from "@/server/modules/jobs/queue";
import { createPlaybook } from "@/server/modules/playbooks/service";
import { createTestContext, destroyTestContext, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await destroyTestContext(ctx);
});

describe("find_knowledge handler", () => {
  // A brand-new playbook has no chapters, so retrieval must synthesise the outline. When the AI
  // gateway is unavailable this used to throw and leave Step 2 permanently blank; it must instead
  // fall back to a deterministic, editable structure so the wizard always moves forward.
  it("builds an editable outline for a from-scratch playbook even without the AI gateway", async () => {
    expect(isAiConfigured()).toBe(false); // tests never reach the real gateway

    const pb = await createPlaybook(ctx.db, ctx.author, {
      ...validBrief,
      customerName: "Fallback Co",
      focusAreas: ["Governance", "Change management"],
    });
    expect(pb.outline).toEqual([]);

    const job = await enqueueJob(ctx.db, { type: "find_knowledge", targetType: "playbook", targetId: pb.id, createdBy: ctx.author.id });
    const result = await findKnowledgeHandler({ db: ctx.db, job, payload: {}, progress: async () => {} });

    expect(result.outlineProposed).toBe(true);
    expect(result.retrieval).toBe("keyword"); // degraded: no embeddings and no reachable gateway

    const chapterRows = await ctx.db.select().from(chapters).where(eq(chapters.playbookId, pb.id)).orderBy(chapters.position);
    expect(chapterRows.map((c) => c.title)).toContain("Recommended approach");

    const sectionRows = await ctx.db.select().from(sections).where(eq(sections.playbookId, pb.id));
    // The brief's focus areas become the sections under the recommended-approach chapter.
    expect(sectionRows.map((s) => s.title)).toEqual(expect.arrayContaining(["Governance", "Change management"]));
  });
});
