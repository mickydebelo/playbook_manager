import { api } from "@/lib/api-client";
import type {
  AssistantReply,
  BriefInput,
  CreatePlaybookInput,
  JobDto,
  SectionContents,
  KnowledgeSourceDto,
  PlaybookDetail,
  SectionCandidateDto,
  SectionDetail,
  SourceExcerpts,
} from "@/shared/contracts";

/** Typed wrappers for every endpoint the wizard uses. */
export const workspaceApi = {
  playbook: (id: string) => api.get<PlaybookDetail>(`/api/playbooks/${id}`),
  createPlaybook: (input: CreatePlaybookInput) => api.post<PlaybookDetail>("/api/playbooks", input),
  playbookBriefSave: (id: string, input: BriefInput) => api.put<PlaybookDetail>(`/api/playbooks/${id}/brief`, input),
  setStage: (id: string, stage: number) => api.patch<PlaybookDetail>(`/api/playbooks/${id}`, { stage }),

  findKnowledge: (playbookId: string) => api.post<{ jobId: string }>(`/api/playbooks/${playbookId}/find-knowledge`),
  createDraft: (playbookId: string, overwrite = false) =>
    api.post<{ jobId: string }>(`/api/playbooks/${playbookId}/create-draft`, { overwrite }),
  regenerate: (sectionId: string, instruction?: string) =>
    api.post<{ jobId: string }>(`/api/sections/${sectionId}/regenerate`, instruction ? { instruction } : {}),
  job: (jobId: string) => api.get<JobDto>(`/api/jobs/${jobId}`),
  /** Every section's body in one call, polled while a draft job runs. */
  sectionContents: (playbookId: string) => api.get<SectionContents>(`/api/playbooks/${playbookId}/content`),
  /** The most recent job of a type, so a reload can reattach to work already in flight. */
  latestJob: (playbookId: string, type: "find_knowledge" | "create_draft" | "export_playbook") =>
    api.get<JobDto | null>(`/api/playbooks/${playbookId}/jobs?type=${type}`),

  addChapter: (playbookId: string, title = "New chapter") =>
    api.post<{ id: string; title: string; position: number }>(`/api/playbooks/${playbookId}/chapters`, { title }),
  renameChapter: (chapterId: string, title: string) => api.patch(`/api/chapters/${chapterId}`, { title }),
  deleteChapter: (chapterId: string) => api.del(`/api/chapters/${chapterId}`),

  addSection: (chapterId: string, title = "New section") => api.post<SectionDetail>(`/api/chapters/${chapterId}/sections`, { title }),
  renameSection: (sectionId: string, title: string) => api.patch<SectionDetail>(`/api/sections/${sectionId}`, { title }),
  deleteSection: (sectionId: string) => api.del(`/api/sections/${sectionId}`),

  section: (sectionId: string) => api.get<SectionDetail>(`/api/sections/${sectionId}`),
  saveContent: (sectionId: string, contentMd: string, baseSavedAt: string | null, reason: "edit" | "insert" | "assistant" | "restore" = "edit") =>
    api.put<SectionDetail>(`/api/sections/${sectionId}/content`, { contentMd, baseSavedAt, reason }),

  sectionKnowledge: (sectionId: string, opts: { q?: string; approvedOnly?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set("q", opts.q);
    if (opts.approvedOnly) p.set("approvedOnly", "true");
    const qs = p.toString();
    return api.get<SectionCandidateDto[]>(`/api/sections/${sectionId}/knowledge${qs ? `?${qs}` : ""}`);
  },
  setSourceSelected: (sectionId: string, sourceId: string, selected: boolean) =>
    api.put(`/api/sections/${sectionId}/sources/${sourceId}`, { selected }),
  /** The passages that made this source a candidate for this section. */
  sourceExcerpts: (sectionId: string, sourceId: string) =>
    api.get<SourceExcerpts>(`/api/sections/${sectionId}/knowledge/${sourceId}/excerpts`),

  /** Curator/admin review decision. Approving is what makes a source retrievable. */
  setSourceStatus: (sourceId: string, status: "draft" | "approved" | "archived") =>
    api.patch<{ id: string; status: string }>(`/api/knowledge/${sourceId}`, { status }),

  /** Uploads a document into the library. Parsing and embedding happen in a job. */
  ingestSource: (file: File, opts: { customerId?: string | null } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (opts.customerId) form.append("customerId", opts.customerId);
    return api.post<{ sourceId: string; jobId: string; title: string; fileType: string }>("/api/knowledge/ingest", form);
  },

  assistantHistory: (sectionId: string) =>
    api.get<{ id: string; role: "user" | "assistant"; body: string; createdAt: string }[]>(`/api/sections/${sectionId}/assistant`),
  assistantSend: (sectionId: string, message: string, ctx: { contentMd?: string; baseSavedAt: string | null; allowEdit: boolean }) =>
    api.post<AssistantReply>(`/api/sections/${sectionId}/assistant`, { message, ...ctx }),
  suggestIntro: (sectionId: string) => api.post<{ text: string }>(`/api/sections/${sectionId}/suggestions/intro`),

  versions: (sectionId: string) =>
    api.get<{ id: string; reason: string; createdAt: string; createdBy: string | null; wordCount: number }[]>(`/api/sections/${sectionId}/versions`),
  restoreVersion: (sectionId: string, versionId: string) =>
    api.post<SectionDetail>(`/api/sections/${sectionId}/versions/${versionId}/restore`),

  startExport: (playbookId: string, body: { format: "docx" | "pdf"; includeSources: boolean; includeComments: boolean }) =>
    api.post<{ exportId: string; jobId: string }>(`/api/playbooks/${playbookId}/exports`, body),

  library: (opts: { q?: string; filter?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set("q", opts.q);
    if (opts.filter && opts.filter !== "all") p.set("filter", opts.filter);
    const qs = p.toString();
    return api.get<KnowledgeSourceDto[]>(`/api/knowledge${qs ? `?${qs}` : ""}`);
  },
};

/** Polls a job until it settles. Resolves with the terminal state. */
export async function waitForJob(jobId: string, onTick?: (job: JobDto) => void, intervalMs = 1200, timeoutMs = 600_000): Promise<JobDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await workspaceApi.job(jobId);
    onTick?.(job);
    if (job.status === "succeeded" || job.status === "failed") return job;
    if (Date.now() > deadline) return { ...job, status: "failed", error: "This is taking longer than expected. Check back shortly." };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
