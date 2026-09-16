import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { jobs } from "@/server/db/schema";
import { claimNextJob, completeJob, enqueueJob, failJob, getJob, latestJobFor, MAX_ATTEMPTS, reportProgress } from "@/server/modules/jobs/queue";
import { drainJobs, registerJobHandler, runNextJob } from "@/server/modules/jobs/worker";
import { createTestContext, destroyTestContext, type TestContext } from "../helpers/db";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await destroyTestContext(ctx);
});
beforeEach(async () => {
  await ctx.db.delete(jobs);
});

const target = "00000000-0000-4000-8000-00000000000a";

describe("job queue", () => {
  it("enqueues as queued with an empty payload by default", async () => {
    const job = await enqueueJob(ctx.db, { type: "create_draft", targetType: "playbook", targetId: target });
    expect(job).toMatchObject({ status: "queued", attempts: 0, type: "create_draft", payload: {} });
    expect(job.startedAt).toBeNull();
  });

  it("claims the oldest due job exactly once and marks it running", async () => {
    const first = await enqueueJob(ctx.db, { type: "find_knowledge", targetType: "playbook", targetId: target, payload: { n: 1 } });
    await new Promise((r) => setTimeout(r, 5));
    await enqueueJob(ctx.db, { type: "find_knowledge", targetType: "playbook", targetId: target, payload: { n: 2 } });

    const claimed = await claimNextJob(ctx.db);
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.payload).toEqual({ n: 1 });
    // camelCase columns must survive the claim — a raw `returning *` loses them silently
    expect(claimed?.targetId).toBe(target);
    expect(claimed?.targetType).toBe("playbook");
    expect(claimed?.startedAt).toBeInstanceOf(Date);
    expect(claimed?.runAfter).toBeInstanceOf(Date);

    const second = await claimNextJob(ctx.db);
    expect(second?.id).not.toBe(first.id);
    expect(await claimNextJob(ctx.db)).toBeNull();
  });

  it("does not claim a job whose run_after is in the future", async () => {
    const job = await enqueueJob(ctx.db, { type: "export_playbook", targetType: "playbook", targetId: target });
    await ctx.db.update(jobs).set({ runAfter: new Date(Date.now() + 60_000) }).where(eq(jobs.id, job.id));
    expect(await claimNextJob(ctx.db)).toBeNull();
  });

  it("records progress and clears it on completion", async () => {
    const job = await enqueueJob(ctx.db, { type: "create_draft", targetType: "playbook", targetId: target });
    await reportProgress(ctx.db, job.id, { done: 2, total: 8, label: "Drafting Governance" });
    expect((await getJob(ctx.db, job.id)).progress).toEqual({ done: 2, total: 8, label: "Drafting Governance" });

    await completeJob(ctx.db, job.id, { sections: 8 });
    const done = await getJob(ctx.db, job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result).toEqual({ sections: 8 });
    expect(done.progress).toBeNull();
    expect(done.finishedAt).not.toBeNull();
  });

  it("retries with backoff until attempts are exhausted, then fails", async () => {
    await enqueueJob(ctx.db, { type: "ingest_source", targetType: "source", targetId: target });
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const claimed = await claimNextJob(ctx.db);
      expect(claimed?.attempts).toBe(attempt);
      expect(await failJob(ctx.db, claimed!, `boom ${attempt}`)).toBe("retrying");
      const requeued = await getJob(ctx.db, claimed!.id);
      expect(requeued.status).toBe("queued");
      expect(requeued.runAfter.getTime()).toBeGreaterThan(Date.now());
      // make it due again for the next pass
      await ctx.db.update(jobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(jobs.id, claimed!.id));
    }
    const last = await claimNextJob(ctx.db);
    expect(last?.attempts).toBe(MAX_ATTEMPTS);
    expect(await failJob(ctx.db, last!, "final")).toBe("failed");
    const dead = await getJob(ctx.db, last!.id);
    expect(dead.status).toBe("failed");
    expect(dead.error).toBe("final");
  });

  it("finds the most recent job of a type for a target", async () => {
    await enqueueJob(ctx.db, { type: "find_knowledge", targetType: "playbook", targetId: target, payload: { n: 1 } });
    await new Promise((r) => setTimeout(r, 5));
    const newer = await enqueueJob(ctx.db, { type: "find_knowledge", targetType: "playbook", targetId: target, payload: { n: 2 } });
    expect((await latestJobFor(ctx.db, "find_knowledge", target))?.id).toBe(newer.id);
    expect(await latestJobFor(ctx.db, "export_playbook", target)).toBeNull();
  });

  it("404s for an unknown job", async () => {
    await expect(getJob(ctx.db, "00000000-0000-4000-8000-0000000000ff")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("worker", () => {
  it("dispatches to the registered handler, passes the payload and stores the result", async () => {
    const seen: Record<string, unknown>[] = [];
    const targets: string[] = [];
    registerJobHandler("export_playbook", async ({ payload, progress, job }) => {
      seen.push(payload);
      targets.push(job.targetId);
      await progress({ done: 1, total: 1, label: "Rendering" });
      return { artifact: "file.docx" };
    });
    const job = await enqueueJob(ctx.db, { type: "export_playbook", targetType: "playbook", targetId: target, payload: { format: "docx" } });

    expect(await runNextJob(ctx.db)).toBe(true);
    expect(seen).toEqual([{ format: "docx" }]);
    expect(targets).toEqual([target]); // the handler must get a real target id, not undefined
    const done = await getJob(ctx.db, job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result).toEqual({ artifact: "file.docx" });
  });

  it("returns false when the queue is empty", async () => {
    expect(await runNextJob(ctx.db)).toBe(false);
  });

  it("requeues a throwing handler and eventually parks it as failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerJobHandler("regenerate_section", async () => {
      throw new Error("model unavailable");
    });
    const job = await enqueueJob(ctx.db, { type: "regenerate_section", targetType: "section", targetId: target });

    await runNextJob(ctx.db);
    expect((await getJob(ctx.db, job.id)).status).toBe("queued");

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await ctx.db.update(jobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(jobs.id, job.id));
      await runNextJob(ctx.db);
    }
    const dead = await getJob(ctx.db, job.id);
    expect(dead.status).toBe("failed");
    expect(dead.error).toContain("model unavailable");
    error.mockRestore();
  });

  it("fails a job with no registered handler rather than looping on it", async () => {
    const job = await enqueueJob(ctx.db, { type: "ingest_source", targetType: "source", targetId: target });
    await ctx.db.update(jobs).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(jobs.id, job.id));
    await runNextJob(ctx.db);
    expect((await getJob(ctx.db, job.id)).error).toContain("No handler registered");
  });

  it("drains several jobs in one pass and stops at the cap", async () => {
    let handled = 0;
    registerJobHandler("create_draft", async () => {
      handled++;
      return {};
    });
    for (let i = 0; i < 4; i++) await enqueueJob(ctx.db, { type: "create_draft", targetType: "playbook", targetId: target });
    expect(await drainJobs(ctx.db)).toBe(4);
    expect(handled).toBe(4);
    expect(await drainJobs(ctx.db)).toBe(0);

    for (let i = 0; i < 3; i++) await enqueueJob(ctx.db, { type: "create_draft", targetType: "playbook", targetId: target });
    expect(await drainJobs(ctx.db, 2)).toBe(2);
    const remaining = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(eq(jobs.status, "queued"));
    expect(remaining[0]!.n).toBe(1);
  });
});
