import { registerJobHandler } from "../worker";
import { findKnowledgeHandler } from "./find-knowledge";
import { createDraftHandler, regenerateSectionHandler } from "./drafting";
import { exportPlaybookHandler } from "./export";
import { ingestSourceHandler } from "./ingest";

let registered = false;

/**
 * Registers every job handler exactly once. Called from the route wrapper so any request that can
 * enqueue work has the handlers loaded, and from the standalone worker entry point.
 */
export function registerAllJobHandlers(): void {
  if (registered) return;
  registered = true;
  registerJobHandler("find_knowledge", findKnowledgeHandler);
  registerJobHandler("create_draft", createDraftHandler);
  registerJobHandler("regenerate_section", regenerateSectionHandler);
  registerJobHandler("export_playbook", exportPlaybookHandler);
  registerJobHandler("ingest_source", ingestSourceHandler);
}
