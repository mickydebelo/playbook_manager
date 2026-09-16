import type { Db } from "../../db/client";
import type { JobDto } from "@/shared/contracts";
import { registerAllJobHandlers } from "./handlers";
import { enqueueJob, getJob, type EnqueueInput, type JobRow } from "./queue";
import { kickInlineWorker } from "./worker";

export { getJob, latestJobFor, MAX_ATTEMPTS } from "./queue";
export { drainJobs, runNextJob, startWorker } from "./worker";
export { registerAllJobHandlers };

export function toJobDto(row: JobRow): JobDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress ?? null,
    error: row.status === "failed" ? row.error : null,
    result: row.result ?? null,
  };
}

/**
 * Enqueues work and, in inline mode, starts draining without blocking the caller.
 * Handler registration happens here so every entry point that can enqueue has them loaded.
 */
export async function enqueueAndKick(db: Db, input: EnqueueInput): Promise<JobRow> {
  registerAllJobHandlers();
  const job = await enqueueJob(db, input);
  kickInlineWorker();
  return job;
}

export async function getJobDto(db: Db, jobId: string): Promise<JobDto> {
  return toJobDto(await getJob(db, jobId));
}
