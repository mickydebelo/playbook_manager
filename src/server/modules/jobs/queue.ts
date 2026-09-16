import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { jobs } from "../../db/schema";
import { notFound } from "../../http/errors";
import type { JOB_TYPES } from "@/shared/enums";

export type JobType = (typeof JOB_TYPES)[number];
export type JobRow = typeof jobs.$inferSelect;
export type JobProgress = { done: number; total: number; label: string };

/** Attempts before a job is parked as failed. */
export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 15_000, 60_000];

export type EnqueueInput = {
  type: JobType;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
};

export async function enqueueJob(db: Db, input: EnqueueInput): Promise<JobRow> {
  const [row] = await db
    .insert(jobs)
    .values({
      type: input.type,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload ?? {},
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

/**
 * Atomically takes the oldest due job. `FOR UPDATE SKIP LOCKED` keeps multiple workers from
 * claiming the same row; with the embedded single-connection database it is simply a no-op.
 *
 * The claim itself is raw SQL (drizzle has no `UPDATE ... FROM (SELECT ... FOR UPDATE)` builder),
 * so it returns only the id and the row is then read back through the schema. Returning `*` from
 * raw SQL would hand back snake_case keys and silently lose every camelCase field.
 */
export async function claimNextJob(db: Db): Promise<JobRow | null> {
  const claimed = await db.execute<{ id: string }>(sql`
    update jobs set
      status = 'running',
      started_at = now(),
      attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'queued' and run_after <= now()
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id
  `);
  const rows = Array.isArray(claimed) ? claimed : ((claimed as unknown as { rows: { id: string }[] }).rows ?? []);
  const id = rows[0]?.id;
  if (!id) return null;
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ?? null;
}

export async function reportProgress(db: Db, jobId: string, progress: JobProgress): Promise<void> {
  await db.update(jobs).set({ progress }).where(eq(jobs.id, jobId));
}

export async function completeJob(db: Db, jobId: string, result: Record<string, unknown>): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "succeeded", result, progress: null, error: null, finishedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/** Requeues with backoff while attempts remain, otherwise parks the job as failed. */
export async function failJob(db: Db, job: JobRow, message: string): Promise<"retrying" | "failed"> {
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  if (exhausted) {
    await db.update(jobs).set({ status: "failed", error: message, progress: null, finishedAt: new Date() }).where(eq(jobs.id, job.id));
    return "failed";
  }
  const delay = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)] ?? 60_000;
  await db
    .update(jobs)
    .set({ status: "queued", error: message, progress: null, runAfter: new Date(Date.now() + delay) })
    .where(eq(jobs.id, job.id));
  return "retrying";
}

export async function getJob(db: Db, jobId: string): Promise<JobRow> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!row) throw notFound("Job");
  return row;
}

/** The most recent job of a type for a target — used to resume a wizard step after a reload. */
export async function latestJobFor(db: Db, type: JobType, targetId: string): Promise<JobRow | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, type), eq(jobs.targetId, targetId)))
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(1);
  return row ?? null;
}
