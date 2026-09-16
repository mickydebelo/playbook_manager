/**
 * Enumerations shared by the database schema, the API contracts and the UI.
 * Labels are the exact strings used in the design (design/Playbook Manager.dc.html).
 */
export const USER_ROLES = ["author", "curator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INDUSTRIES = ["aeco", "dm", "me", "public_sector", "other"] as const;
export type Industry = (typeof INDUSTRIES)[number];
export const INDUSTRY_LABELS: Record<Industry, string> = {
  aeco: "AECO (Architecture, Engineering, Construction & Operations)",
  dm: "D&M (Design & Manufacturing)",
  me: "M&E (Media & Entertainment)",
  public_sector: "Public sector",
  other: "Other",
};
/** Short label used in list rows ("Northwind Engineering · AECO"). */
export const INDUSTRY_SHORT: Record<Industry, string> = {
  aeco: "AECO",
  dm: "D&M",
  me: "M&E",
  public_sector: "Public sector",
  other: "Other",
};

export const SIZE_BANDS = ["small", "medium", "large", "enterprise"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const SIZE_BAND_DEFS: Record<SizeBand, { label: string; range: string }> = {
  small: { label: "Small", range: "< 1,000" },
  medium: { label: "Medium", range: "1,000 – 10,000" },
  large: { label: "Large", range: "10,000 – 50,000" },
  enterprise: { label: "Enterprise", range: "> 50,000" },
};

export const PLAYBOOK_STATUSES = ["draft", "in_review", "delivered", "archived"] as const;
export type PlaybookStatus = (typeof PLAYBOOK_STATUSES)[number];
export const PLAYBOOK_STATUS_LABELS: Record<PlaybookStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  delivered: "Delivered",
  archived: "Archived",
};
export const PLAYBOOK_STATUS_TONES: Record<PlaybookStatus, "warning" | "info" | "positive" | "neutral"> = {
  draft: "warning",
  in_review: "info",
  delivered: "positive",
  archived: "neutral",
};

export const STAGES = [1, 2, 3, 4] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  1: "Define brief",
  2: "Find & trust",
  3: "Edit & create",
  4: "Review & deliver",
};

export const BRIEF_SOURCE_KINDS = ["doc", "link"] as const;
export type BriefSourceKind = (typeof BRIEF_SOURCE_KINDS)[number];

export const COVERAGE = ["none", "thin", "ok"] as const;
export type Coverage = (typeof COVERAGE)[number];

export const VERSION_REASONS = ["edit", "regenerate", "assistant", "insert", "restore"] as const;
export const MESSAGE_ROLES = ["user", "assistant"] as const;
export const SOURCE_TYPES = ["pdf", "docx", "pptx", "link"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_STATUSES = ["draft", "approved", "archived"] as const;
export const SOURCE_CURRENCIES = ["current", "older"] as const;
export const RELEVANCES = ["high", "medium", "low"] as const;
export const COLLAB_ROLES = ["reviewer", "editor"] as const;
export type CollabRole = (typeof COLLAB_ROLES)[number];
export const TEMPLATE_KINDS = ["recommended", "focused", "short_form", "industry", "blank"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  recommended: "Recommended",
  focused: "Focused",
  short_form: "Short form",
  industry: "Industry",
  blank: "Blank",
};
export const EXPORT_FORMATS = ["docx", "pdf", "pptx", "mp4", "web"] as const;
export const JOB_TYPES = ["find_knowledge", "create_draft", "regenerate_section", "export_playbook", "ingest_source"] as const;
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
