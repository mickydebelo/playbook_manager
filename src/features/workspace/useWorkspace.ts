"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobDto, PlaybookDetail, SectionCandidateDto, SectionDetail, SourceExcerpts, UserDto } from "@/shared/contracts";
import { briefInputSchema } from "@/shared/contracts";
import { SIZE_BANDS, SIZE_BAND_DEFS } from "@/shared/enums";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/shell/Toast";
import { ICONS } from "./icons";
import { briefFromDetail, briefToInput, DEFAULT_BRAND_COLOR, emptyBrief, INDUSTRY_OPTIONS, type BriefState } from "./brief-state";
import { useSetState } from "./useSetState";
import { INGEST_ACCEPT_ATTR } from "@/shared/ingest-formats";
import { workspaceApi, waitForJob } from "./api";
import {
  candidateView,
  countWords,
  coverageColor,
  flattenOutline,
  highlightTerms,
  parseBlocks,
  savedLabel as formatSavedLabel,
  tagsForSource,
  TYPE,
  type FlatNode,
} from "./view-model";
import type { Chip, StepDef, WorkspaceVals } from "./types";

/**
 * Wizard state. Steps 1–3 run against the API: the outline, the candidate sources, the selections
 * and the section drafts are all stored server-side, and the long-running work (structure proposal,
 * retrieval, drafting) is dispatched as background jobs and polled.
 *
 * Still local, pending their endpoints (docs/04-gap-analysis.md): comments, the tailor options,
 * export, sharing and "save as template".
 */
type Comment = { initials: string; author: string; when: string; text: string };

/** A chat bubble. Assistant turns that rewrote the section carry the undo payload with them. */
type ChatEntry = {
  role: "user" | "assistant";
  text: string;
  failed?: boolean;
  applied?: boolean;
  undone?: boolean;
  summary?: string;
  previousMd?: string;
};

/** A save that lost a race: the user's text is kept here rather than discarded. */
type ContentConflict = { local: string; remote: SectionDetail };

type UiState = {
  step: number;
  brief: BriefState;
  focusInputOpen: boolean;
  focusDraft: string;
  selectedSectionId: string | null;
  collapsed: Record<string, boolean>;
  previewId: string | null;
  previewTab: string;
  previewPage: number;
  zoom: number;
  docPage: number;
  docZoom: number;
  knowledgeQuery: string;
  filterOn: boolean;
  editRaw: boolean;
  rightTab: string;
  chatDraft: string;
  chatBusy: boolean;
  conflict: ContentConflict | null;
  comments: Comment[];
  commentDraft: string;
  reviewTab: string;
  tailor: boolean[];
  exportFormat: string;
  downloadExportId: string | null;
  downloadName: string;
  includeSources: boolean;
  includeComments: boolean;
  shareOpen: boolean;
  winW: number;
  libQuery: string;
  libFilter: string;
  /** Bumped after an upload so the library list reloads. */
  libraryVersion: number;
  uploading: boolean;
  suggestionUsed: boolean;
  exporting: boolean;
  persistedStage: number;
  saving: boolean;
};

export type WorkspaceOptions = {
  initial: PlaybookDetail | null;
  user: UserDto;
  startStep?: number;
  templateId?: string | null;
  showAiSuggestions?: boolean;
};

const sizeDefs = SIZE_BANDS.map((b) => [SIZE_BAND_DEFS[b].label, SIZE_BAND_DEFS[b].range] as const);
/** Word and PDF render today; the rest are in the design but have no renderer, so they are shown disabled. */
const EXPORT_FORMAT_OPTIONS = [
  { value: "docx", label: "Microsoft Word (.docx)", supported: true },
  { value: "pdf", label: "PDF document (.pdf)", supported: true },
  { value: "pptx", label: "PowerPoint deck (.pptx) — not available yet", supported: false },
  { value: "mp4", label: "Curated video (.mp4) — not available yet", supported: false },
  { value: "web", label: "Web page (shareable link) — not available yet", supported: false },
];

/** Mirrors DRAFT_CONCURRENCY in the drafting handler: how many sections the server writes at once. */
const DRAFT_CONCURRENCY = 2;

const FOCUS_SUGGESTIONS = ["Business strategy", "Project management", "Change management", "Document control"];
const TOOLBAR: [keyof typeof ICONS, string][] = [
  ["bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"], ["ul", "Bulleted list"], ["ol", "Numbered list"],
  ["alignL", "Align left"], ["alignC", "Align center"], ["alignR", "Align right"], ["linkS", "Insert link"], ["comment", "Comment"],
];

function initialsOf(name: string): string {
  return name.split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export function useWorkspace(options: WorkspaceOptions): WorkspaceVals {
  const router = useRouter();
  const toast = useToast();
  const showToast = useCallback((m: string) => toast.show(m), [toast]);
  const errorToast = useCallback(
    (err: unknown, fallback: string) => showToast(err instanceof ApiClientError ? err.message : fallback),
    [showToast],
  );

  // ---- server state --------------------------------------------------------
  const [detail, setDetail] = useState<PlaybookDetail | null>(options.initial);
  const [candidates, setCandidates] = useState<SectionCandidateDto[]>([]);
  const [sectionCache, setSectionCache] = useState<Record<string, SectionDetail>>({});
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [job, setJob] = useState<JobDto | null>(null);
  const [library, setLibrary] = useState<ReturnType<typeof candidateView>[]>([]);
  /** The passages behind the previewed source's proposal, loaded on demand for step 2's panel. */
  const [excerpts, setExcerpts] = useState<SourceExcerpts | null>(null);
  const [excerptsBusy, setExcerptsBusy] = useState(false);
  /** Sections whose text has landed during this draft run, used to drive the reveal animation. */
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  /** Characters of the open section revealed so far; null once it is fully shown. */
  const [revealed, setRevealed] = useState<number | null>(null);
  const revealedFor = useRef<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  /**
   * The last job's terminal state. `job` is cleared when work finishes so the busy flags go quiet,
   * which used to discard the result with it — including the list of sections that failed to draft.
   */
  const [lastResult, setLastResult] = useState<JobDto | null>(null);
  /** Guards the reattach probe so it runs once per playbook rather than on every render. */
  const reattachedFor = useRef<string | null>(null);

  const playbookId = detail?.id ?? null;
  const flat = useMemo(() => flattenOutline(detail), [detail]);
  const firstSectionId = flat.find((n) => n.kind === "section")?.sectionId ?? null;

  const [s, setState] = useSetState<UiState>(() => ({
    step: Math.min(Math.max(options.startStep ?? options.initial?.stage ?? 1, 1), 4),
    brief: options.initial ? briefFromDetail(options.initial) : emptyBrief(),
    focusInputOpen: false,
    focusDraft: "",
    selectedSectionId: null,
    collapsed: {},
    previewId: null,
    previewTab: "Preview",
    previewPage: 1,
    zoom: 100,
    docPage: 1,
    docZoom: 75,
    knowledgeQuery: "",
    filterOn: false,
    editRaw: false,
    rightTab: "Sources",
    chatDraft: "",
    chatBusy: false,
    conflict: null,
    comments: [],
    commentDraft: "",
    reviewTab: "Document preview",
    tailor: [true, true, true, true, true, false],
    exportFormat: "docx",
    downloadExportId: null,
    downloadName: "",
    includeSources: false,
    includeComments: false,
    shareOpen: false,
    winW: typeof window !== "undefined" ? window.innerWidth : 1440,
    libQuery: "",
    libFilter: "All",
    libraryVersion: 0,
    uploading: false,
    suggestionUsed: false,
    exporting: false,
    persistedStage: options.initial?.stage ?? 1,
    saving: false,
  }));

  const selectedId = s.selectedSectionId ?? firstSectionId;
  const selectedNode = flat.find((n) => n.sectionId === selectedId && n.kind === "section") ?? flat.find((n) => n.kind === "section") ?? null;
  const briefDirty = useRef(false);
  const contentDirty = useRef(false);

  // ---- window width --------------------------------------------------------
  useEffect(() => {
    const onResize = () => setState({ winW: window.innerWidth });
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [setState]);

  const refreshDetail = useCallback(
    async (id: string | null = playbookId) => {
      if (!id) return;
      try {
        setDetail(await workspaceApi.playbook(id));
      } catch (err) {
        errorToast(err, "Couldn't refresh the playbook");
      }
    },
    [playbookId, errorToast],
  );

  // ---- brief autosave ------------------------------------------------------
  useEffect(() => {
    if (!playbookId || !briefDirty.current) return;
    const input = briefToInput(s.brief);
    if (!briefInputSchema.safeParse(input).success) return;
    const t = setTimeout(async () => {
      briefDirty.current = false;
      setState({ saving: true });
      try {
        setDetail(await workspaceApi.playbookBriefSave(playbookId, input));
      } catch (err) {
        briefDirty.current = true;
        errorToast(err, "Couldn't save the brief");
      } finally {
        setState({ saving: false });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [s.brief, playbookId, setState, errorToast]);

  // ---- candidates for the selected section --------------------------------
  useEffect(() => {
    if (!selectedId || s.step !== 2) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await workspaceApi.sectionKnowledge(selectedId, { q: s.knowledgeQuery, approvedOnly: s.filterOn });
        if (!cancelled) setCandidates(list);
      } catch (err) {
        if (!cancelled) errorToast(err, "Couldn't load sources for this section");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, s.step, s.knowledgeQuery, s.filterOn, errorToast]);

  // ---- the previewed source's matched passages ----------------------------
  useEffect(() => {
    if (!selectedId || !s.previewId || s.step !== 2) {
      setExcerpts(null);
      return;
    }
    const sectionId = selectedId;
    const sourceId = s.previewId;
    let cancelled = false;
    setExcerptsBusy(true);
    void (async () => {
      try {
        const found = await workspaceApi.sourceExcerpts(sectionId, sourceId);
        if (!cancelled) setExcerpts(found);
      } catch {
        // The panel falls back to "no passages"; a failure here must not block selecting the source.
        if (!cancelled) setExcerpts(null);
      } finally {
        if (!cancelled) setExcerptsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, s.previewId, s.step]);

  // ---- section content + assistant history for the editor ------------------
  useEffect(() => {
    if (!selectedId || s.step !== 3) return;
    let cancelled = false;
    void (async () => {
      try {
        const [section, history] = await Promise.all([workspaceApi.section(selectedId), workspaceApi.assistantHistory(selectedId)]);
        if (cancelled) return;
        setSectionCache((c) => ({ ...c, [selectedId]: section }));
        setChat(history.map((m) => ({ role: m.role, text: m.body })));
      } catch (err) {
        if (!cancelled) errorToast(err, "Couldn't load this section");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, s.step, errorToast]);

  // ---- library -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await workspaceApi.library({ q: s.libQuery, filter: s.libFilter.toLowerCase() });
        if (!cancelled) {
          setLibrary(
            rows.map((r) => ({
              ...candidateView({ ...r, relevance: "medium", score: null, relevantFor: "", selected: false } as SectionCandidateDto),
              tags: tagsForSource(r),
            })),
          );
        }
      } catch {
        // The library is a secondary surface; a failure here should not interrupt the wizard.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [s.libQuery, s.libFilter, s.libraryVersion]);

  /**
   * Types out a section that arrived while the user was watching. Purely cosmetic: the whole text
   * is already delivered. The gateway has no streaming endpoint, so this is an honest reveal of
   * text we hold rather than a pretend token stream.
   */
  useEffect(() => {
    if (!selectedId || job?.type !== "create_draft") return;
    if (!arrived.has(selectedId) || revealedFor.current === selectedId) return;
    const text = sectionCache[selectedId]?.contentMd ?? "";
    if (!text) return;
    revealedFor.current = selectedId;
    setRevealed(0);
    let shown = 0;
    const step = Math.max(8, Math.ceil(text.length / 90));
    const timer = setInterval(() => {
      shown += step;
      if (shown >= text.length) {
        clearInterval(timer);
        setRevealed(null);
      } else {
        setRevealed(shown);
      }
    }, 28);
    return () => clearInterval(timer);
  }, [selectedId, arrived, sectionCache, job?.type]);

  // ---- helpers -------------------------------------------------------------
  const updBrief = (patch: Partial<BriefState>) => {
    briefDirty.current = true;
    setState((st) => ({ brief: { ...st.brief, ...patch } }));
  };
  const syncUrlStep = (n: number) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(n));
    window.history.replaceState(window.history.state, "", url.toString());
  };
  const persistStage = async (n: number) => {
    if (!playbookId || n <= s.persistedStage) return;
    try {
      await workspaceApi.setStage(playbookId, n);
      setState({ persistedStage: n });
    } catch (err) {
      errorToast(err, "Couldn't update the playbook stage");
    }
  };
  const goStep = (n: number) => {
    setState({ step: n });
    syncUrlStep(n);
    void persistStage(n);
  };
  const addFocus = (label: string) =>
    setState((st) => {
      if (st.brief.focus.includes(label)) return {};
      briefDirty.current = true;
      return { brief: { ...st.brief, focus: [...st.brief.focus, label] }, focusInputOpen: false, focusDraft: "" };
    });

  /**
   * Starts a job and polls it. `type` must be the real job type: the placeholder used to be
   * hardcoded, so the Create-draft and Regenerate buttons showed no busy state until the first poll.
   */
  const runJob = async (
    type: JobDto["type"],
    start: () => Promise<{ jobId: string }>,
    onDone: (job: JobDto) => Promise<void>,
    failMessage: string,
    onTick?: (job: JobDto) => void,
  ) => {
    try {
      const { jobId } = await start();
      setJob({ id: jobId, type, status: "queued", progress: null, error: null, result: null });
      const finished = await waitForJob(jobId, (j) => {
        setJob(j);
        onTick?.(j);
      });
      setLastResult(finished);
      if (finished.status === "failed") {
        setJob(null);
        showToast(finished.error ?? failMessage);
        return false;
      }
      await onDone(finished);
      setJob(null);
      return true;
    } catch (err) {
      setJob(null);
      errorToast(err, failMessage);
      return false;
    }
  };

  // ---- step 1 → 2 ----------------------------------------------------------
  const briefInvalid = !s.brief.customer.trim() || !s.brief.objective.trim();
  const finding = job?.type === "find_knowledge" || false;

  const findKnowledge = async () => {
    if (briefInvalid || finding) return;
    const input = briefToInput(s.brief);
    const parsed = briefInputSchema.safeParse(input);
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message ?? "Check the brief");
      return;
    }
    // A brand-new playbook is created first; from then on the flow is the same for both cases.
    const isNew = !playbookId;
    let id = playbookId;
    briefDirty.current = false;
    try {
      const saved = isNew
        ? await workspaceApi.createPlaybook({ ...input, ...(options.templateId ? { templateId: options.templateId } : {}) })
        : await workspaceApi.playbookBriefSave(id!, input);
      id = saved.id;
      setDetail(saved);
    } catch (err) {
      briefDirty.current = true;
      errorToast(err, isNew ? "Couldn't create the playbook" : "Couldn't save the brief");
      return;
    }

    const ok = await runJob(
      "find_knowledge",
      () => workspaceApi.findKnowledge(id!),
      async () => {
        await refreshDetail(id);
        await workspaceApi.setStage(id!, 2).catch(() => undefined);
        setState({ persistedStage: Math.max(2, s.persistedStage) });
        // Only a newly created playbook changes URL; an existing one just advances in place.
        if (isNew) router.replace(`/playbooks/${id}?step=2`);
        else {
          setState({ step: 2 });
          syncUrlStep(2);
        }
      },
      "Couldn't find relevant knowledge",
    );
    if (ok) showToast("Structure and sources are ready");
  };

  // ---- step 2 → 3 ----------------------------------------------------------
  const drafting = job?.type === "create_draft";

  /** Pulls every section's body and merges it into the cache, so finished sections become editable. */
  const pullSectionContents = useCallback(
    async (id: string) => {
      try {
        const rows = await workspaceApi.sectionContents(id);
        setSectionCache((cache) => {
          const next = { ...cache };
          for (const row of rows) {
            const existing = next[row.id];
            // Never clobber text the user is actively editing.
            if (existing && existing.contentSavedAt === row.contentSavedAt) continue;
            next[row.id] = { ...(existing ?? ({} as SectionDetail)), ...(existing ?? {}), ...row } as SectionDetail;
          }
          return next;
        });
        setArrived((a) => {
          const next = new Set(a);
          for (const row of rows) if (row.contentMd.trim()) next.add(row.id);
          return next;
        });
      } catch {
        // A failed poll is not worth interrupting the draft for; the next tick retries.
      }
    },
    [],
  );

  /**
   * Reattaches to a draft already in flight. Drafting a playbook takes minutes, so a reload — or
   * simply reopening the playbook from the list — used to land on a step 3 that looked idle while
   * the server was still writing sections.
   */
  useEffect(() => {
    if (!playbookId || reattachedFor.current === playbookId) return;
    reattachedFor.current = playbookId;
    let cancelled = false;
    void (async () => {
      try {
        const running = await workspaceApi.latestJob(playbookId, "create_draft");
        if (cancelled || !running || (running.status !== "running" && running.status !== "queued")) return;
        setJob(running);
        await pullSectionContents(playbookId);
        const finished = await waitForJob(running.id, (j) => {
          if (cancelled) return;
          setJob(j);
          void pullSectionContents(playbookId);
        });
        if (cancelled) return;
        setLastResult(finished);
        setJob(null);
        await pullSectionContents(playbookId);
        await refreshDetail(playbookId);
      } catch {
        // Nothing in flight, or the probe failed. Either way the wizard works normally.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playbookId, pullSectionContents, refreshDetail]);

  const createDraft = async () => {
    if (!playbookId || drafting) return;
    // Move to step 3 straight away and let the sections land one by one.
    setArrived(new Set());
    setSectionCache({});
    goStep(3);
    await runJob(
      "create_draft",
      () => workspaceApi.createDraft(playbookId),
      async () => {
        await pullSectionContents(playbookId);
        await refreshDetail();
      },
      "Couldn't create the draft",
      () => void pullSectionContents(playbookId),
    );
  };

  const exporting = job?.type === "export_playbook";

  const runExport = async () => {
    if (!playbookId || exporting) return;
    const format = s.exportFormat === "pdf" ? "pdf" : "docx";
    setState({ downloadExportId: null, downloadName: "" });
    await runJob(
      "export_playbook",
      async () => {
        const { exportId, jobId } = await workspaceApi.startExport(playbookId, {
          format,
          includeSources: s.includeSources,
          includeComments: s.includeComments,
        });
        setState({ downloadExportId: exportId });
        return { jobId };
      },
      async (finished) => {
        const name = typeof finished.result?.fileName === "string" ? finished.result.fileName : `playbook.${format}`;
        setState({ downloadName: name });
        showToast(`${format.toUpperCase()} ready — ${name}`);
      },
      "Couldn't export the playbook",
    );
  };

  // ---- step 3 --------------------------------------------------------------
  const currentSection = selectedId ? sectionCache[selectedId] : undefined;
  const draftText = currentSection?.contentMd ?? "";
  const regenerating = job?.type === "regenerate_section";

  const regenerate = async (instruction?: string) => {
    if (!selectedId || regenerating) return;
    await runJob(
      "regenerate_section",
      () => workspaceApi.regenerate(selectedId, instruction),
      async () => {
        const fresh = await workspaceApi.section(selectedId);
        setSectionCache((c) => ({ ...c, [selectedId]: fresh }));
        await refreshDetail();
      },
      "Couldn't regenerate this section",
    );
  };

  const saveContent = async (
    contentMd: string,
    reason: "edit" | "insert" | "assistant" | "restore" = "edit",
    sectionId: string | null = selectedId,
  ): Promise<boolean> => {
    if (!sectionId) return false;
    const base = sectionCache[sectionId]?.contentSavedAt ?? null;
    setState({ saving: true });
    try {
      const saved = await workspaceApi.saveContent(sectionId, contentMd, base, reason);
      setSectionCache((c) => ({ ...c, [sectionId]: saved }));
      contentDirty.current = false;
      setState({ conflict: null });
      await refreshDetail();
      return true;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        // Somebody else saved first. Keep the user's text and let them choose, rather than
        // toasting and leaving the autosave to retry the same doomed write every 1.2 seconds.
        contentDirty.current = false;
        try {
          const remote = await workspaceApi.section(sectionId);
          setState({ conflict: { local: contentMd, remote } });
        } catch {
          errorToast(err, "This section changed elsewhere");
        }
        return false;
      }
      errorToast(err, "Couldn't save this section");
      return false;
    } finally {
      setState({ saving: false });
    }
  };

  // Debounced autosave of editor edits.
  useEffect(() => {
    if (!selectedId || !contentDirty.current) return;
    const text = sectionCache[selectedId]?.contentMd;
    if (text === undefined) return;
    const t = setTimeout(() => void saveContent(text), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionCache, selectedId]);

  const setDraftText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedId) return;
    contentDirty.current = true;
    const next = e.target.value;
    setSectionCache((c) => {
      const current = c[selectedId];
      return current ? { ...c, [selectedId]: { ...current, contentMd: next, wordCount: countWords(next) } } : c;
    });
  };

  const sendChat = async (text?: string) => {
    const message = (text ?? s.chatDraft).trim();
    const sectionId = selectedId;
    if (!message || !sectionId || s.chatBusy) return;

    // The model edits what the user is looking at, including keystrokes the autosave has not flushed.
    const buffer = sectionCache[sectionId]?.contentMd;
    const baseSavedAt = sectionCache[sectionId]?.contentSavedAt ?? null;
    const canEdit = detail?.permissions.canEdit ?? true;

    const userIndex = chat.length;
    setChat((c) => [...c, { role: "user", text: message }]);
    setState({ chatDraft: "", chatBusy: true });

    try {
      const reply = await workspaceApi.assistantSend(sectionId, message, { contentMd: buffer, baseSavedAt, allowEdit: canEdit });
      // The user may have moved on while the model was thinking.
      if (sectionId !== selectedId) return;

      let applied = false;
      const previousMd = sectionCache[sectionId]?.contentMd ?? "";
      if (reply.proposal && reply.proposal.contentMd !== previousMd) {
        applied = await saveContent(reply.proposal.contentMd, "assistant", sectionId);
      }
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: reply.body,
          applied,
          summary: reply.proposal?.summary,
          previousMd: applied ? previousMd : undefined,
        },
      ]);
    } catch (err) {
      // Mark the question as failed rather than inventing an assistant turn that was never stored.
      setChat((c) => c.map((entry, i) => (i === userIndex ? { ...entry, failed: true } : entry)));
      errorToast(err, "The assistant is unavailable");
    } finally {
      setState({ chatBusy: false });
    }
  };

  /** Puts back the text an assistant edit replaced. The revert is itself a new version. */
  const undoAssistantEdit = async (index: number) => {
    const entry = chat[index];
    if (!entry?.applied || entry.previousMd === undefined) return;
    if (await saveContent(entry.previousMd, "restore")) {
      setChat((c) => c.map((x, i) => (i === index ? { ...x, applied: false, undone: true } : x)));
    }
  };

  const insertSuggestion = async () => {
    if (!selectedId) return;
    try {
      const { text } = await workspaceApi.suggestIntro(selectedId);
      const current = sectionCache[selectedId]?.contentMd ?? "";
      const lines = current.split("\n");
      const headingAt = lines.findIndex((l) => l.startsWith("# "));
      const next = headingAt === -1 ? `${text}\n\n${current}` : [...lines.slice(0, headingAt + 1), "", text, ...lines.slice(headingAt + 1)].join("\n");
      setState({ suggestionUsed: true });
      await saveContent(next, "insert");
    } catch (err) {
      errorToast(err, "Couldn't write the introduction");
    }
  };

  // ---- outline editing -----------------------------------------------------
  const addChapter = async () => {
    if (!playbookId) return;
    try {
      const chapter = await workspaceApi.addChapter(playbookId);
      await workspaceApi.addSection(chapter.id, "New section");
      await refreshDetail();
    } catch (err) {
      errorToast(err, "Couldn't add a chapter");
    }
  };

  const addSection = async () => {
    const chapterId = selectedNode?.chapterId ?? detail?.outline[0]?.id;
    if (!chapterId) return;
    try {
      const created = await workspaceApi.addSection(chapterId);
      await refreshDetail();
      setState({ selectedSectionId: created.id });
    } catch (err) {
      errorToast(err, "Couldn't add a section");
    }
  };

  const toggleSource = async (sourceId: string, selected: boolean) => {
    if (!selectedId) return;
    setCandidates((list) => list.map((c) => (c.id === sourceId ? { ...c, selected } : c)));
    try {
      await workspaceApi.setSourceSelected(selectedId, sourceId, selected);
      await refreshDetail();
    } catch (err) {
      setCandidates((list) => list.map((c) => (c.id === sourceId ? { ...c, selected: !selected } : c)));
      errorToast(err, "Couldn't update the selection");
    }
  };

  const postComment = () => {
    if (!s.commentDraft.trim()) return;
    setState((st) => ({
      comments: [...st.comments, { initials: initialsOf(options.user.name), author: options.user.name, when: "now", text: st.commentDraft.trim() }],
      commentDraft: "",
    }));
  };

  const docPageCount = flat.length ? 2 + flat.length + (s.includeSources ? 1 : 0) : 0;

  /**
   * Scrolls the preview iframe to a page. The document is one scrolling HTML file, not paged
   * images. The page number is advanced from the previous state so rapid clicks accumulate.
   */
  const stepDocPage = (delta: number) => {
    setState((st) => {
      const page = Math.min(Math.max(1, st.docPage + delta), Math.max(1, docPageCount));
      previewRef.current?.contentDocument?.querySelectorAll(".page")[page - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
      return { docPage: page };
    });
  };

  // ---- derived view values -------------------------------------------------
  const b = s.brief;
  const step = s.step;
  const narrow = s.winW < 1180;
  const customer = b.customer.trim() || "the customer";
  const showAI = options.showAiSuggestions ?? true;

  const visibleNodes = flat.filter((n) => n.kind === "chapter" || !s.collapsed[n.chapterId]);
  const selectNode = (node: FlatNode) => {
    if (node.sectionId) setState({ selectedSectionId: node.sectionId, previewId: null, editRaw: false });
  };

  const outline = visibleNodes.map((node, i) => {
    const active = node.sectionId === selectedId && (node.kind === "section" || node.childCount === 0);
    return {
      key: node.key,
      n: node.n,
      title: node.title,
      count: node.sourceCount,
      statusBg: coverageColor(node.coverage),
      isChapter: node.kind === "chapter" && node.childCount > 0,
      rot: s.collapsed[node.chapterId] ? "0deg" : "90deg",
      pad: node.kind === "chapter" ? "4px" : "32px",
      bg: active ? "var(--warm-slate-300)" : "transparent",
      color: "var(--adsk-black)",
      weight: node.kind === "chapter" ? 700 : active ? 700 : 400,
      borderTop: node.kind === "chapter" && i > 0 ? "1px solid var(--slate-100)" : "none",
      mt: node.kind === "chapter" && i > 0 ? "8px" : "0",
      iconColor: active ? "var(--adsk-black)" : "var(--slate)",
      select: () => selectNode(node),
      toggle: (e: React.MouseEvent) => {
        e.stopPropagation();
        setState((st) => ({ collapsed: { ...st.collapsed, [node.chapterId]: !st.collapsed[node.chapterId] } }));
      },
    };
  });

  const sectionHasText = (node: FlatNode): boolean =>
    !!node.sectionId &&
    (arrived.has(node.sectionId) || (sectionCache[node.sectionId]?.contentMd ?? "").trim().length > 0 || node.wordCount > 0);

  /**
   * The sections being written right now. The job label names only one section while two workers
   * run, so it flapped and under-reported; the drafting order is the outline order, which makes the
   * leading undrafted sections the ones in flight.
   */
  const inFlight = new Set(
    drafting
      ? flat
          .filter((n) => n.kind === "section" && n.sectionId && !sectionHasText(n))
          .slice(0, DRAFT_CONCURRENCY)
          .map((n) => n.sectionId!)
      : [],
  );

  /** pending | drafting | ready, so the outline shows the draft arriving section by section. */
  const draftStatusFor = (node: FlatNode): "pending" | "drafting" | "ready" | "idle" => {
    if (node.kind === "chapter" || !node.sectionId) return "idle";
    if (sectionHasText(node)) return "ready";
    if (!drafting) return "idle";
    return inFlight.has(node.sectionId) ? "drafting" : "pending";
  };
  const statusColor: Record<string, string> = {
    ready: "var(--morning-600)",
    drafting: "var(--twilight)",
    pending: "var(--slate-200)",
    idle: "transparent",
  };

  const outlineFlat = flat.map((node, i) => ({
    key: node.key,
    n: node.n,
    title: node.title,
    indent: node.kind === "section" ? "    " : "",
    count: node.sourceCount,
    pad: node.kind === "chapter" ? "8px" : "32px",
    weight: node.kind === "chapter" ? 700 : 400,
    bg: node.sectionId === selectedId && node.kind === "section" ? "var(--warm-slate-100)" : "transparent",
    mt: node.kind === "chapter" && i > 0 ? "8px" : "0",
    borderTop: node.kind === "chapter" && i > 0 ? "1px solid var(--slate-100)" : "none",
    iconColor: node.sectionId === selectedId ? "var(--adsk-black)" : "var(--slate)",
    draftStatus: draftStatusFor(node),
    draftDot: statusColor[draftStatusFor(node)] ?? "transparent",
    select: () => selectNode(node),
  }));

  const knowledge = candidates.map((c) => {
    const view = candidateView(c);
    const isPrev = s.previewId === c.id;
    return {
      ...view,
      checked: c.selected,
      border: isPrev ? "var(--adsk-black)" : "var(--slate-200)",
      bg: isPrev ? "var(--warm-slate-100)" : "var(--adsk-white)",
      preview: () => setState({ previewId: c.id, previewPage: 1 }),
      toggle: () => void toggleSource(c.id, !c.selected),
    };
  });

  const previewCandidate = candidates.find((c) => c.id === s.previewId) ?? null;
  const preview = previewCandidate ? candidateView(previewCandidate) : null;
  const previewUsed = previewCandidate?.selected ?? false;
  const selectedCandidates = candidates.filter((c) => c.selected);

  const totalSelected = flat.reduce((a, n) => (n.kind === "section" ? a + n.sourceCount : a), 0);
  const sectionsWithSources = flat.filter((n) => n.kind === "section" && n.sourceCount > 0).length;
  const thinSections = flat.filter((n) => n.kind === "section" && n.coverage !== "ok");
  const warnCount = thinSections.length;

  const blocks = parseBlocks(draftText);
  const wordCount = currentSection?.wordCount ?? countWords(draftText);
  /** Section titles the last draft run could not write, read from the job's terminal result. */
  const draftFailures =
    lastResult?.type === "create_draft" && Array.isArray(lastResult.result?.failures)
      ? (lastResult.result.failures as unknown[]).map(String)
      : [];
  const sizeLabel = (sizeDefs[b.size]?.[0] ?? "Medium").toLowerCase();
  const jobLabel = job?.progress?.label;

  const tailorLabels = [
    `Use ${customer} terminology and branding`,
    `Tailor for ${b.industry.split(" ")[0]} industry context`,
    `Highlight relevance for a ${sizeLabel} organization`,
    "Focus on the selected products and workflows",
    `Emphasize ${b.focus.length ? b.focus.map((f) => f.toLowerCase()).join(" and ") : "the selected focus areas"}`,
    "Create executive summary version (shorter)",
  ];

  const chip = (label: string, active: boolean, pick: () => void): Chip => ({
    label, pick,
    bg: active ? "var(--adsk-black)" : "var(--adsk-white)",
    color: active ? "var(--adsk-white)" : "var(--adsk-black)",
    border: active ? "var(--adsk-black)" : "var(--slate-200)",
  });

  const mkStep = (n: number, label: string): StepDef => {
    const done = n < step, active = n === step;
    return {
      n, label, done, notDone: !done, notFirst: n > 1, notLast: n < 4,
      bg: active || done ? "var(--adsk-black)" : "var(--adsk-white)",
      color: active || done ? "var(--adsk-white)" : "var(--adsk-black)",
      border: active || done ? "var(--adsk-black)" : "var(--slate-300)",
      lineBg: n <= step ? "var(--adsk-black)" : "var(--slate-200)",
      lineBgNext: n < step ? "var(--adsk-black)" : "var(--slate-200)",
      weight: active ? 700 : 400,
      labelColor: active ? "var(--adsk-black)" : "var(--slate)",
      go: () => { if (n <= step || (!briefInvalid && playbookId)) goStep(n); },
    };
  };

  const previewMeta = preview
    ? ([["Type", String(preview.type).toUpperCase()], ["Owner", preview.org], ["Published", String(preview.year)], ["Pages", String(preview.pages)], ["Used in", `${preview.usedIn} playbooks`], ["Status", preview.tags[0]?.label ?? ""]] as const).map(([k, v]) => ({ k, v }))
    : [];

  return {
    step1: step === 1, step2: step === 2, step3: step === 3, step4: step === 4,
    steps: [mkStep(1, "Define brief"), mkStep(2, "Find & trust"), mkStep(3, "Edit & create"), mkStep(4, "Review & deliver")],
    brief: b, customerName: customer, playbookId, saving: s.saving,

    // step 1
    setCustomer: (e: React.ChangeEvent<HTMLInputElement>) => updBrief({ customer: e.target.value }),
    clearCustomer: () => updBrief({ customer: "" }),
    toggleLogo: () => { updBrief({ logo: !b.logo }); showToast(b.logo ? "Customer logo removed" : "Logo upload is not built yet"); },
    logoBg: b.logo ? "var(--warm-slate-100)" : "var(--adsk-white)",
    logoLabel: b.logo ? "Logo added" : "Add customer logo",
    toggleColor: () => updBrief({ color: b.color ? null : DEFAULT_BRAND_COLOR }),
    brandColor: b.color || "var(--adsk-white)",
    industries: INDUSTRY_OPTIONS,
    setIndustry: (e: React.ChangeEvent<HTMLSelectElement>) => updBrief({ industry: e.target.value }),
    sizes: sizeDefs.map(([label, range], i) => {
      const on = b.size === i;
      return { label, range, border: on ? "var(--adsk-black)" : "var(--slate-300)", dot: on ? "var(--adsk-black)" : "transparent", weight: on ? 700 : 400, pick: () => updBrief({ size: i }) };
    }),
    setObjective: (e: React.ChangeEvent<HTMLTextAreaElement>) => updBrief({ objective: e.target.value.slice(0, 500) }),
    objectiveCount: b.objective.length,
    focusSelected: b.focus.map((f) => ({ label: f, remove: () => updBrief({ focus: b.focus.filter((x) => x !== f) }) })),
    focusSuggestions: FOCUS_SUGGESTIONS.filter((x) => !b.focus.includes(x)).map((label) => ({ label, add: () => addFocus(label) })),
    focusInputOpen: s.focusInputOpen, focusInputClosed: !s.focusInputOpen, focusDraft: s.focusDraft,
    openFocusInput: () => setState({ focusInputOpen: true }),
    setFocusDraft: (e: React.ChangeEvent<HTMLInputElement>) => setState({ focusDraft: e.target.value }),
    focusKey: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && s.focusDraft.trim()) addFocus(s.focusDraft.trim());
      if (e.key === "Escape") setState({ focusInputOpen: false, focusDraft: "" });
    },
    briefSources: b.sources.map((x) => ({
      ...x, icon: { __html: x.type === "link" ? ICONS.link : ICONS.doc },
      setTitle: (e: React.ChangeEvent<HTMLInputElement>) => updBrief({ sources: b.sources.map((y) => (y.id === x.id ? { ...y, title: e.target.value } : y)) }),
      setUrl: (e: React.ChangeEvent<HTMLInputElement>) => updBrief({ sources: b.sources.map((y) => (y.id === x.id ? { ...y, url: e.target.value } : y)) }),
      remove: () => updBrief({ sources: b.sources.filter((y) => y.id !== x.id) }),
    })),
    addBriefSource: () => updBrief({ sources: [...b.sources, { id: `b${Date.now()}`, type: "link", title: "New source", url: "" }] }),
    toggleOptional: () => setState((st) => ({ brief: { ...st.brief, contextOpen: !st.brief.contextOpen } })),
    optionalOpen: b.contextOpen, optionalRot: b.contextOpen ? "90deg" : "0deg",
    setContext: (e: React.ChangeEvent<HTMLTextAreaElement>) => updBrief({ context: e.target.value }),
    optionalSummary: b.contextOpen ? "" : `${b.sources.length} source${b.sources.length === 1 ? "" : "s"}${b.context.trim() ? " · context added" : ""}`,
    briefInvalid, finding: finding || briefInvalid,
    findLabel: finding ? (jobLabel ?? "Finding relevant knowledge…") : "Find relevant knowledge",
    findKnowledge: () => void findKnowledge(),
    cancel: () => router.push("/playbooks"),

    // step 2
    step2Cols: preview ? "minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1.1fr)" : "minmax(0,0.9fr) minmax(0,2fr)",
    step3Cols: narrow ? "minmax(0,1.6fr) minmax(280px,1fr)" : "minmax(220px,0.8fr) minmax(320px,1.8fr) minmax(280px,1fr)",
    narrow, wide: !narrow,
    selectedId: selectedId ?? "",
    selectById: (e: React.ChangeEvent<HTMLSelectElement>) => setState({ selectedSectionId: e.target.value, editRaw: false }),
    outline, outlineFlat,
    selectedTitle: selectedNode?.title ?? detail?.title ?? "",
    selectedN: selectedNode?.n ?? "",
    addChapter: () => void addChapter(),
    addSection: () => void addSection(),
    knowledge, knowledgeCount: knowledge.length, knowledgeEmpty: knowledge.length === 0,
    knowledgeQuery: s.knowledgeQuery,
    setKnowledgeQuery: (e: React.ChangeEvent<HTMLInputElement>) => setState({ knowledgeQuery: e.target.value }),
    toggleFilter: () => setState({ filterOn: !s.filterOn }),
    filterBg: s.filterOn ? "var(--warm-slate-300)" : "var(--adsk-white)",
    filterLabel: s.filterOn ? "Approved only" : "Filter",
    hasPreview: !!preview, preview, closePreview: () => setState({ previewId: null }),
    previewTabs: ["Preview", "Metadata"], previewTab: s.previewTab,
    setPreviewTab: (t: string) => setState({ previewTab: t }),
    previewIsPreview: s.previewTab === "Preview", previewIsMeta: s.previewTab === "Metadata", previewMeta,
    // The panel shows the passages retrieval actually matched, not a mock of the document's cover.
    previewExcerpts: (excerpts?.excerpts ?? []).map((e) => ({
      n: e.n,
      pageLabel: e.pageNo ? `Page ${e.pageNo}` : "Page unknown",
      scoreLabel: e.score === null ? "Opening passage" : `${Math.round(Math.max(0, Math.min(1, e.score)) * 100)}% match`,
      runs: highlightTerms(e.text, excerpts?.topic ?? "").map((r, i) => ({
        key: i,
        text: r.text,
        bg: r.hit ? "var(--hello-yellow)" : "transparent",
      })),
    })),
    previewExcerptsBusy: excerptsBusy,
    previewExcerptsEmpty: !excerptsBusy && (excerpts?.excerpts.length ?? 0) === 0,
    previewExcerptCount: excerpts?.excerpts.length ?? 0,
    previewMatchedFor: excerpts?.sectionTitle ?? selectedNode?.title ?? "",
    zoom: s.zoom,
    zoomIn: () => setState({ zoom: Math.min(200, s.zoom + 25) }),
    zoomOut: () => setState({ zoom: Math.max(50, s.zoom - 25) }),
    excerptFont: `${Math.round((s.zoom / 100) * 13)}px`,
    zoomWidth: `${s.zoom * 2.6}px`, zoomWidthDoc: `${s.zoom * 5.6}px`,
    openOriginal: () => {
      if (preview?.url) window.open(preview.url, "_blank", "noopener");
      else showToast("This source has no stored file yet");
    },
    useVariant: previewUsed ? "secondary" : "primary",
    useLabel: previewUsed ? "Used in this section" : "Use in this section",
    growStyle: { flex: 1, justifyContent: "center" },
    toggleUsePreview: () => { if (previewCandidate) void toggleSource(previewCandidate.id, !previewCandidate.selected); },
    totalSelected, sectionsWithSources,
    drafting, draftLabel: drafting ? (jobLabel ?? "Creating draft…") : "Create draft",
    jobProgress: job?.progress ?? null,
    jobProgressPercent: job?.progress && job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : 0,
    showProgress: !!job?.progress && job.progress.total > 1,
    progressLabel: job?.progress ? `${job.progress.label} · ${job.progress.done} of ${job.progress.total}` : "",
    // A partial draft used to finish silently: the job succeeded, and the sections that failed were
    // left empty with nothing in the UI to say so.
    draftFailures,
    hasDraftFailures: draftFailures.length > 0,
    draftFailureSummary:
      draftFailures.length === 1
        ? "One section could not be drafted."
        : `${draftFailures.length} sections could not be drafted.`,
    dismissDraftFailures: () => setLastResult(null),
    createDraft: () => void createDraft(),
    goStep1: () => goStep(1), goStep2: () => goStep(2), goStep3: () => goStep(3), goStep4: () => goStep(4),

    // step 3
    regenerating, regenLabel: regenerating ? (jobLabel ?? "Regenerating…") : "Regenerate section",
    draftOpacity: regenerating ? 0.4 : 1,
    regenerate: () => void regenerate(),
    toolbar: TOOLBAR.map(([k, title]) => ({
      title, icon: { __html: ICONS[k] },
      bg: k === "alignL" ? "var(--warm-slate-100)" : "transparent",
      click: () => showToast("Rich-text formatting is not built yet — edit the markdown with “Edit text”"),
    })),
    editRaw: s.editRaw, editRich: !s.editRaw,
    editModeLabel: s.editRaw ? "Editing text" : "Formatted view",
    editToggleLabel: s.editRaw ? "Done" : "Edit text",
    toggleEditMode: () => setState({ editRaw: !s.editRaw }),
    draftText: revealed === null ? draftText : draftText.slice(0, revealed),
    setDraftText, wordCount,
    blocks: revealed === null ? blocks : parseBlocks(draftText.slice(0, revealed)),
    revealing: revealed !== null,
    sectionPending: drafting && !!selectedId && !(sectionCache[selectedId]?.contentMd ?? "").trim(),
    savedLabel: s.saving ? "Saving…" : formatSavedLabel(currentSection?.contentSavedAt ?? null),
    hasConflict: !!s.conflict,
    conflictMessage: "This section was changed elsewhere while you were editing.",
    keepMine: () => void (async () => {
      const c = s.conflict;
      if (!c || !selectedId) return;
      setSectionCache((cache) => ({ ...cache, [selectedId]: c.remote }));
      setState({ conflict: null });
      await saveContent(c.local, "edit");
    })(),
    useTheirs: () => {
      const c = s.conflict;
      if (!c || !selectedId) return;
      setSectionCache((cache) => ({ ...cache, [selectedId]: c.remote }));
      setState({ conflict: null });
    },
    toast_changes: () => void (async () => {
      if (!selectedId) return;
      try {
        const versions = await workspaceApi.versions(selectedId);
        showToast(versions.length ? `${versions.length} earlier version${versions.length === 1 ? "" : "s"} saved` : "No earlier versions yet");
      } catch (err) {
        errorToast(err, "Couldn't load the history");
      }
    })(),
    rightTabs: ["Sources", "Assistant", "Comments"], rightTab: s.rightTab,
    setRightTab: (t: string) => setState({ rightTab: t }),
    rightIsSources: s.rightTab === "Sources", rightIsAI: s.rightTab === "Assistant", rightIsComments: s.rightTab === "Comments",
    sectionSources: selectedCandidates.map((c) => ({
      ...candidateView(c),
      openPreview: () => { setState({ previewId: c.id, previewPage: 1, previewTab: "Preview" }); goStep(2); },
      removeFromSection: (e: React.MouseEvent) => { e.stopPropagation(); void toggleSource(c.id, false); },
    })),
    sectionSourceCount: selectedCandidates.length, noSectionSources: selectedCandidates.length === 0,
    showSuggestion: showAI && !s.suggestionUsed && !!selectedId,
    insertSuggestion: () => void insertSuggestion(),
    chat: chat.map((m, i) => ({
      ...m,
      align: m.role === "user" ? "flex-end" : "flex-start",
      bg: m.failed ? "var(--dusk-100)" : m.role === "user" ? "var(--adsk-black)" : "var(--warm-slate-100)",
      color: m.failed ? "var(--dusk-700)" : m.role === "user" ? "var(--adsk-white)" : "var(--adsk-black)",
      appliedLabel: m.applied ? `Applied to the section${m.summary ? ` · ${m.summary}` : ""}` : m.undone ? "Change undone" : "",
      canUndo: !!m.applied,
      undo: () => void undoAssistantEdit(i),
    })),
    chatBusy: s.chatBusy,
    aiPrompts: ["Shorten this section", "Make it more executive", `Tailor for ${customer}`].map((label) => ({ label, send: () => void sendChat(label) })),
    chatDraft: s.chatDraft,
    setChatDraft: (e: React.ChangeEvent<HTMLInputElement>) => setState({ chatDraft: e.target.value }),
    chatKey: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void sendChat(); },
    sendChat: () => void sendChat(),
    chatSendDisabled: s.chatBusy,
    comments: s.comments, commentDraft: s.commentDraft,
    setCommentDraft: (e: React.ChangeEvent<HTMLInputElement>) => setState({ commentDraft: e.target.value }),
    addComment: postComment,
    commentKey: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") postComment(); },
    saveDraft: () => void (async () => {
      if (selectedId && sectionCache[selectedId]) await saveContent(sectionCache[selectedId]!.contentMd);
      showToast("Draft saved");
    })(),

    // step 4
    openShare: () => setState({ shareOpen: true }), closeShare: () => setState({ shareOpen: false }), shareOpen: s.shareOpen,
    shareBody: "Sharing for feedback is not built yet. Collaborator invitations and review links are the next piece of work.",
    sendShare: () => { setState({ shareOpen: false }); showToast("Sharing is not built yet"); },
    toast_more: () => showToast("Duplicate and archive are available from the API; the menu is not built yet"),
    reviewTabs: ["Document preview", "Structure"], reviewTab: s.reviewTab,
    setReviewTab: (t: string) => setState({ reviewTab: t }),
    reviewIsDoc: s.reviewTab === "Document preview", reviewIsStructure: s.reviewTab === "Structure",
    coverSubtitle: b.objective.trim() ? `${(b.objective.trim().split(". ")[0] ?? "").replace(/\.$/, "")}.` : `A tailored plan for ${customer}.`,
    // The preview is the real rendered document, served by the same renderer the PDF prints.
    previewUrl: playbookId ? `/api/playbooks/${playbookId}/preview?sources=${s.includeSources ? "1" : "0"}` : "",
    hasDocument: !!playbookId && flat.length > 0,
    docPageCount: docPageCount,
    docScale: s.docZoom / 100,
    docZoom: s.docZoom,
    docPage: s.docPage,
    previewRef,
    docZoomIn: () => setState({ docZoom: Math.min(200, s.docZoom + 25) }),
    docZoomOut: () => setState({ docZoom: Math.max(50, s.docZoom - 25) }),
    docPrevPage: () => stepDocPage(-1),
    docNextPage: () => stepDocPage(1),
    coverDate: new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    tailor: tailorLabels.map((label, i) => ({
      label, checked: s.tailor[i] ?? false,
      toggle: (v: boolean) => setState((st) => ({ tailor: st.tailor.map((x, j) => (j === i ? v : x)) })),
    })),
    readyWord: warnCount === 0 && b.focus.length > 0 && flat.length > 0 ? "ready" : "almost ready",
    readiness: ([
      ["Based on approved and current content", totalSelected > 0, null, "Select sources in Find & trust"],
      ["Sources are cited and traceable", sectionsWithSources > 0, null, "Select sources in Find & trust"],
      ["Covers your requested focus areas", b.focus.length > 0, () => goStep(1), "Add focus areas in the brief"],
      [warnCount ? `${warnCount} section${warnCount === 1 ? " has" : "s have"} thin coverage` : "No major knowledge gaps", warnCount === 0, () => {
        const w = thinSections[0];
        if (w?.sectionId) setState({ selectedSectionId: w.sectionId, previewId: null });
        goStep(2);
      }, thinSections.length ? `Go to ${thinSections.slice(0, 3).map((x) => x.n.replace(/\.$/, "")).join(", ")}` : ""],
      ["Ready for customer use", warnCount === 0 && b.focus.length > 0 && flat.length > 0, () => goStep(3), "Resolve the items above"],
    ] as [string, boolean, (() => void) | null, string][]).map(([label, ok, fix, hint], i) => ({
      label, ok, fail: !ok, fix: fix ?? (() => {}), hint,
      bg: ok ? (i === 4 ? "var(--hello-yellow)" : "var(--adsk-black)") : "var(--dawn)",
      fg: ok && i === 4 ? "var(--adsk-black)" : "var(--adsk-white)",
      weight: i === 4 ? 700 : 400,
      path: ok ? "M5 13l4 4L19 7" : "M12 7v6M12 17h.01",
    })),
    // The select stores the enum value; the label is display only. They used to be the same string,
    // so nothing could be sent to an API that expects "docx".
    exportFormats: EXPORT_FORMAT_OPTIONS,
    exportFormat: s.exportFormat,
    setExportFormat: (e: React.ChangeEvent<HTMLSelectElement>) => setState({ exportFormat: e.target.value }),
    includeSources: s.includeSources, setIncludeSources: (v: boolean) => setState({ includeSources: v }),
    // Comments are still browser-only, so there is nothing to include. Disabled beats pretending.
    includeComments: s.includeComments, setIncludeComments: (v: boolean) => setState({ includeComments: v }),
    commentsUnavailable: true,
    exporting, exportLabel: exporting ? (jobLabel ?? "Exporting…") : "Export playbook",
    exportDisabled: exporting || !playbookId || !EXPORT_FORMAT_OPTIONS.find((f) => f.value === s.exportFormat)?.supported,
    centerStyle: { justifyContent: "center" },
    exportPlaybook: () => void runExport(),
    downloadUrl: s.downloadExportId ? `/api/exports/${s.downloadExportId}/download` : "",
    downloadName: s.downloadName,
    clearDownload: () => setState({ downloadExportId: null, downloadName: "" }),
    shareLink: () => showToast("Share links are not built yet"),
    saveTemplate: () => showToast("Save as template is not built yet"),

    // library / help
    library, libraryEmpty: library.length === 0, libQuery: s.libQuery,
    setLibQuery: (e: React.ChangeEvent<HTMLInputElement>) => setState({ libQuery: e.target.value }),
    libFilters: ["All", "Approved", "Current", "External"].map((f) => chip(f, s.libFilter === f, () => setState({ libFilter: f }))),
    uploading: s.uploading,
    uploadAccept: INGEST_ACCEPT_ATTR,
    uploadSource: async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Clear the input so choosing the same file again still fires a change event.
      e.target.value = "";
      if (!file) return;
      setState({ uploading: true });
      try {
        const started = await workspaceApi.ingestSource(file);
        showToast(`Indexing ${started.title}`);
        const finished = await waitForJob(started.jobId);
        if (finished.status === "failed") showToast(finished.error ?? "That file could not be indexed");
        else {
          const chunks = Number((finished.result as { chunks?: number } | null)?.chunks ?? 0);
          showToast(`${started.title} indexed: ${chunks} passages. Approve it to make it retrievable.`);
        }
      } catch (err) {
        errorToast(err, "That file could not be uploaded");
      } finally {
        setState((st) => ({ uploading: false, libraryVersion: st.libraryVersion + 1 }));
      }
    },
    helpSteps: ([
      ["1", "Define brief", "Describe the customer, objective and focus areas. Optional sources and context sharpen the search."],
      ["2", "Find & trust", "Review the proposed structure and pick approved sources per section. Every source shows status, age and relevance."],
      ["3", "Edit & create", "Refine each section with the editor or the assistant. Citations stay attached to the text they support."],
      ["4", "Review & deliver", "Tailor for the customer, pass the readiness check, then export or share for feedback."],
    ] as const).map(([n, title, desc]) => ({ n, title, desc })),
  };
}
