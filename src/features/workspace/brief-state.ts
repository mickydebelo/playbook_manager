import type { BriefInput, PlaybookDetail } from "@/shared/contracts";
import { INDUSTRIES, INDUSTRY_LABELS, SIZE_BANDS, type Industry } from "@/shared/enums";

/** Brief as the design's Step 1 holds it (labels and indexes), with converters to/from the API contract. */
export type BriefSourceState = { id: string; type: "doc" | "link"; title: string; url: string };
export type BriefState = {
  customer: string;
  industry: string; // full label, as shown in the select
  size: number; // index into SIZE_BANDS
  objective: string;
  focus: string[];
  contextOpen: boolean;
  context: string;
  logo: boolean;
  color: string | null; // hex or null
  sources: BriefSourceState[];
};

export const INDUSTRY_OPTIONS: string[] = INDUSTRIES.map((i) => INDUSTRY_LABELS[i]);
/** Twilight (#1d91d0) is the placeholder brand colour the prototype applied. */
export const DEFAULT_BRAND_COLOR = "#1d91d0";

export function industryFromLabel(label: string): Industry {
  return INDUSTRIES.find((i) => INDUSTRY_LABELS[i] === label) ?? "other";
}

export function emptyBrief(): BriefState {
  return { customer: "", industry: INDUSTRY_LABELS.aeco, size: 1, objective: "", focus: [], contextOpen: false, context: "", logo: false, color: null, sources: [] };
}

export function briefFromDetail(d: PlaybookDetail): BriefState {
  return {
    customer: d.customer.name,
    industry: INDUSTRY_LABELS[d.customer.industry],
    size: Math.max(0, SIZE_BANDS.indexOf(d.customer.sizeBand)),
    objective: d.brief.objective,
    focus: d.brief.focusAreas,
    contextOpen: false,
    context: d.brief.additionalContext,
    logo: !!d.customer.logoAssetId,
    color: d.customer.brandColor,
    sources: d.brief.sources.map((s) => ({ id: s.id, type: s.kind, title: s.title, url: s.url })),
  };
}

export function briefToInput(b: BriefState): BriefInput {
  return {
    customerName: b.customer.trim(),
    industry: industryFromLabel(b.industry),
    sizeBand: SIZE_BANDS[b.size] ?? "medium",
    objective: b.objective.trim(),
    focusAreas: b.focus,
    additionalContext: b.context.trim(),
    sources: b.sources.filter((s) => s.title.trim()).map((s) => ({ kind: s.type, title: s.title.trim(), url: s.url.trim() })),
    brandColor: b.color,
    logoAssetId: null,
  };
}
