/**
 * API contracts (zod) shared by route handlers and the client.
 * Validation rules mirror what the design surfaces: customer name and objective are required,
 * the objective is capped at 500 characters.
 */
import { z } from "zod";
import {
  BRIEF_SOURCE_KINDS,
  COLLAB_ROLES,
  INDUSTRIES,
  PLAYBOOK_STATUSES,
  SIZE_BANDS,
  STAGES,
  USER_ROLES,
} from "./enums";

export const OBJECTIVE_MAX = 500;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const trimmed = (max: number) => z.string().trim().max(max);

export const briefSourceInputSchema = z.object({
  kind: z.enum(BRIEF_SOURCE_KINDS).default("link"),
  title: trimmed(200).min(1, "Give the source a title"),
  url: z.union([z.literal(""), z.string().trim().url("Enter a valid URL")]).default(""),
});
export type BriefSourceInput = z.infer<typeof briefSourceInputSchema>;

export const briefInputSchema = z.object({
  customerName: trimmed(200).min(1, "Add a customer name"),
  industry: z.enum(INDUSTRIES),
  sizeBand: z.enum(SIZE_BANDS),
  objective: trimmed(OBJECTIVE_MAX).min(1, "Add an objective"),
  focusAreas: z.array(trimmed(80).min(1)).max(20).default([]),
  additionalContext: trimmed(4000).default(""),
  sources: z.array(briefSourceInputSchema).max(50).default([]),
  brandColor: z.string().regex(HEX_COLOR).nullable().default(null),
  logoAssetId: z.string().uuid().nullable().default(null),
});
export type BriefInput = z.infer<typeof briefInputSchema>;

export const createPlaybookInputSchema = briefInputSchema.extend({
  title: trimmed(200).optional(),
  templateId: z.string().uuid().optional(),
});
export type CreatePlaybookInput = z.infer<typeof createPlaybookInputSchema>;

export const updatePlaybookInputSchema = z
  .object({
    title: trimmed(200).min(1).optional(),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    status: z.enum(PLAYBOOK_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdatePlaybookInput = z.infer<typeof updatePlaybookInputSchema>;

export const listPlaybooksQuerySchema = z.object({
  status: z.enum(PLAYBOOK_STATUSES).optional(),
});

// ---- Response shapes -------------------------------------------------------

export const userDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(USER_ROLES),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const customerDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  industry: z.enum(INDUSTRIES),
  sizeBand: z.enum(SIZE_BANDS),
  brandColor: z.string().nullable(),
  logoAssetId: z.string().nullable(),
});
export type CustomerDto = z.infer<typeof customerDtoSchema>;

export const playbookSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(PLAYBOOK_STATUSES),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  version: z.number().int(),
  ownerId: z.string().uuid(),
  customer: customerDtoSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaybookSummary = z.infer<typeof playbookSummarySchema>;

export const briefDtoSchema = z.object({
  objective: z.string(),
  focusAreas: z.array(z.string()),
  additionalContext: z.string(),
  sources: z.array(
    z.object({ id: z.string().uuid(), kind: z.enum(BRIEF_SOURCE_KINDS), title: z.string(), url: z.string() }),
  ),
  updatedAt: z.string(),
});
export type BriefDto = z.infer<typeof briefDtoSchema>;

export const outlineSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  position: z.number().int(),
  coverage: z.enum(["none", "thin", "ok"]),
  wordCount: z.number().int(),
  sourceCount: z.number().int(),
});
export const outlineChapterSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  position: z.number().int(),
  sections: z.array(outlineSectionSchema),
});

export const collaboratorDtoSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(COLLAB_ROLES),
});

export const playbookDetailSchema = playbookSummarySchema.extend({
  brief: briefDtoSchema,
  outline: z.array(outlineChapterSchema),
  collaborators: z.array(collaboratorDtoSchema),
  permissions: z.object({ canEdit: z.boolean(), canManage: z.boolean() }),
});
export type PlaybookDetail = z.infer<typeof playbookDetailSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---- Outline, sections and knowledge -------------------------------------

export const createChapterInputSchema = z.object({ title: trimmed(200).min(1, "Give the chapter a title").default("New chapter") });
export const updateChapterInputSchema = z
  .object({ title: trimmed(200).min(1).optional(), position: z.number().int().min(0).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const createSectionInputSchema = z.object({
  title: trimmed(200).min(1, "Give the section a title").default("New section"),
  parentSectionId: z.string().uuid().nullable().default(null),
});
export const updateSectionInputSchema = z
  .object({ title: trimmed(200).min(1).optional(), position: z.number().int().min(0).optional(), chapterId: z.string().uuid().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const reorderInputSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });

export const saveSectionContentSchema = z.object({
  contentMd: z.string().max(200_000),
  /** ISO timestamp the edit was based on; omit on a first save. Mismatch returns 409. */
  baseSavedAt: z.string().datetime().nullable().default(null),
  reason: z.enum(["edit", "regenerate", "assistant", "insert", "restore"]).default("edit"),
});

export const setSourceSelectionSchema = z.object({ selected: z.boolean() });

export const knowledgeQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(["all", "approved", "current", "external"]).default("all"),
});

export const sectionKnowledgeQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  approvedOnly: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes"].includes(v.toLowerCase())))
    .default(false),
});

export const assistantMessageSchema = z.object({
  message: trimmed(2000).min(1, "Type a message"),
  /** The editor's live buffer, so the assistant edits what the user sees including unflushed keystrokes. */
  contentMd: z.string().max(200_000).optional(),
  /** The `contentSavedAt` that buffer is based on. Checked before a model call is spent. */
  baseSavedAt: z.string().datetime().nullable().default(null),
  /** False from a read-only surface, or for a user without edit rights. */
  allowEdit: z.boolean().default(true),
});

export const assistantReplySchema = z.object({
  id: z.string().uuid(),
  role: z.literal("assistant"),
  body: z.string(),
  createdAt: z.string(),
  /** Present when the assistant rewrote the section. The client applies it; the server never writes. */
  proposal: z
    .object({ contentMd: z.string(), summary: z.string(), baseSavedAt: z.string().nullable() })
    .nullable()
    .default(null),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export const knowledgeSourceDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["pdf", "docx", "pptx", "link"]),
  title: z.string(),
  subtitle: z.string(),
  ownerOrg: z.string(),
  year: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  url: z.string().nullable(),
  status: z.enum(["draft", "approved", "archived"]),
  currency: z.enum(["current", "older"]),
  isExternal: z.boolean(),
  /** Set when the document belongs to one customer and must not be proposed for another. */
  customerId: z.string().uuid().nullable(),
  /** Null while a source is still being parsed and embedded. */
  indexedAt: z.string().nullable(),
  tags: z.array(z.string()),
  usedIn: z.number().int(),
});
export type KnowledgeSourceDto = z.infer<typeof knowledgeSourceDtoSchema>;

export const sectionCandidateDtoSchema = knowledgeSourceDtoSchema.extend({
  relevance: z.enum(["high", "medium", "low"]),
  score: z.number().nullable(),
  relevantFor: z.string(),
  selected: z.boolean(),
});
export type SectionCandidateDto = z.infer<typeof sectionCandidateDtoSchema>;

/** The ranked passages behind a source's proposal, shown in step 2's preview panel. */
export const sourceExcerptsSchema = z.object({
  sourceId: z.string().uuid(),
  sourceTitle: z.string(),
  sectionTitle: z.string(),
  topic: z.string(),
  excerpts: z.array(
    z.object({
      n: z.number().int(),
      text: z.string(),
      pageNo: z.number().int().nullable(),
      score: z.number().nullable(),
    }),
  ),
});
export type SourceExcerpts = z.infer<typeof sourceExcerptsSchema>;

export const sectionDetailSchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid(),
  chapterId: z.string().uuid(),
  parentSectionId: z.string().uuid().nullable(),
  title: z.string(),
  position: z.number().int(),
  contentMd: z.string(),
  wordCount: z.number().int(),
  coverage: z.enum(["none", "thin", "ok"]),
  contentSavedAt: z.string().nullable(),
});
export type SectionDetail = z.infer<typeof sectionDetailSchema>;

export const sectionVersionDtoSchema = z.object({
  id: z.string().uuid(),
  reason: z.enum(["edit", "regenerate", "assistant", "insert", "restore"]),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  wordCount: z.number().int(),
});

/** Every section's body in one call, so the wizard can poll while a draft job is running. */
export const sectionContentsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    contentMd: z.string(),
    wordCount: z.number().int(),
    contentSavedAt: z.string().nullable(),
  }),
);
export type SectionContents = z.infer<typeof sectionContentsSchema>;

export const jobDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["find_knowledge", "create_draft", "regenerate_section", "export_playbook", "ingest_source"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  progress: z.object({ done: z.number(), total: z.number(), label: z.string() }).nullable(),
  error: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
});
export type JobDto = z.infer<typeof jobDtoSchema>;

/** Stage the wizard should open at for a stored playbook. */
export const stageSchema = z.coerce.number().int().min(1).max(4);
export { STAGES };
