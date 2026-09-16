import type { Db } from "../../db/client";
import { getDb } from "../../db/client";
import { getEnv } from "../../env";
import { claimNextJob, completeJob, failJob, reportProgress, type JobProgress, type JobRow, type JobType } from "./queue";

/**
 * Job runner. In development `JOBS_MODE=inline` drains the queue in the web process just after a job
 * is enqueued; in production `JOBS_MODE=worker` a separate process calls `startWorker`.
 */
export type JobContext = {
  db: Db;
  job: JobRow;
  payload: Record<string, unknown>;
  progress: (p: JobProgress) => Promise<void>;
};

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown>>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function registeredJobTypes(): JobType[] {
  return [...handlers.keys()];
}

/** Runs one job if any is due. Returns false when the queue is empty. */
export async function runNextJob(db: Db): Promise<boolean> {
  const job = await claimNextJob(db);
  if (!job) return false;
  const handler = handlers.get(job.type);
  if (!handler) {
    await failJob(db, job, `No handler registered for job type "${job.type}"`);
    return true;
  }
  try {
    const result = await handler({
      db,
      job,
      payload: job.payload,
      progress: (p) => reportProgress(db, job.id, p),
    });
    await completeJob(db, job.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = await failJob(db, job, message);
    console.error(`[jobs] ${job.type} ${job.id} ${outcome}: ${message}`);
  }
  return true;
}

/** Drains up to `max` jobs. Returns how many ran. */
export async function drainJobs(db: Db, max = 25): Promise<number> {
  let ran = 0;
  while (ran < max && (await runNextJob(db))) ran++;
  return ran;
}

let draining = false;

/**
 * Inline mode: kick the queue without blocking the request that enqueued the job.
 * Re-entrant calls are collapsed into the drain that is already running.
 */
export function kickInlineWorker(): void {
  if (getEnv().JOBS_MODE !== "inline" || draining) return;
  draining = true;
  setTimeout(() => {
    void (async () => {
      try {
        const db = await getDb();
        // Loop so jobs enqueued while draining are picked up in the same pass.
        for (;;) {
          const ran = await drainJobs(db);
          if (ran === 0) break;
        }
      } catch (err) {
        console.error("[jobs] inline worker failed", err);
      } finally {
        draining = false;
      }
    })();
  }, 10);
}

/** Worker mode: poll forever. Used by `npm run worker`. */
export async function startWorker(intervalMs = 1_000): Promise<never> {
  const db = await getDb();
  console.log(`[jobs] worker started, handling: ${registeredJobTypes().join(", ") || "(none)"}`);
  for (;;) {
    try {
      const ran = await drainJobs(db);
      if (ran === 0) await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      console.error("[jobs] worker loop error", err);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
