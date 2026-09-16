import type { CSSProperties } from "react";
import type { BadgeTone } from "@/components/ds";

/**
 * The wizard screens receive a single `v` object of render values, exactly like the prototype's
 * `renderVals()` in design/Playbook Manager.dc.html. Keys are the `{{ … }}` names used in the template.
 * The object is intentionally wide: slices of it move from prototype state to API-backed state phase by phase.
 */
export type Tag = { label: string; tone: BadgeTone };
export type Html = { __html: string };

export type OutlineItem = {
  key: string;
  n: string;
  title: string;
  count: number;
  statusBg?: string;
  isChapter?: boolean;
  rot?: string;
  pad: string;
  bg: string;
  color?: string;
  weight: number;
  borderTop: string;
  mt: string;
  iconColor: string;
  indent?: string;
  /** Draft progress for this row while a create-draft job is running. */
  draftStatus?: "pending" | "drafting" | "ready" | "idle";
  draftDot?: string;
  select: () => void;
  toggle?: (e: React.MouseEvent) => void;
};

export type SourceView = {
  id: string;
  type: string;
  title: string;
  org: string;
  /** Rendered as text next to the owner, and may be blank for an undated source. */
  year: string;
  pages: number;
  usedIn: number;
  subtitle: string;
  tags: Tag[];
  relevantFor: string;
  typeLabel: string;
  typeBg: string;
  typeColor: string;
};

export type KnowledgeItem = SourceView & { checked: boolean; border: string; bg: string; preview: () => void; toggle: () => void };
export type SectionSourceItem = SourceView & { openPreview: () => void; removeFromSection: (e: React.MouseEvent) => void };
export type Block = { type: "h1" | "h2" | "p" | "ul"; text?: string; items?: string[]; isH1: boolean; isH2: boolean; isP: boolean; isUl: boolean };
export type Chip = { label: string; pick: () => void; bg: string; color: string; border: string };
export type StepDef = {
  n: number; label: string; done: boolean; notDone: boolean; notFirst: boolean; notLast: boolean;
  bg: string; color: string; border: string; lineBg: string; lineBgNext: string; weight: number; labelColor: string; go: () => void;
};

/** Wide render-value bag. Screens index it as `v.someKey`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkspaceVals = Record<string, any> & {
  step1: boolean; step2: boolean; step3: boolean; step4: boolean;
  steps: StepDef[];
  customerName: string;
  outline: OutlineItem[];
  outlineFlat: OutlineItem[];
  knowledge: KnowledgeItem[];
  sectionSources: SectionSourceItem[];
  blocks: Block[];
  growStyle: CSSProperties;
  centerStyle: CSSProperties;
};
