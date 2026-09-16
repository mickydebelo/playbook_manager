import { getDbHandle } from "./db/client";
import { registerAllJobHandlers, startWorker } from "./modules/jobs";

// `npm run worker` — the out-of-process job runner for JOBS_MODE=worker.
await getDbHandle();
registerAllJobHandlers();
await startWorker();
