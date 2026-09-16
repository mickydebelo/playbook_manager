/**
 * Prompt templates. Kept in one place so the wording can be reviewed without reading job code.
 *
 * Every model call is steered by a system prompt composed from the step-1 brief, so the customer's
 * industry, size, objective, focus areas and supplied sources shape the whole playbook rather than
 * being mentioned in passing. House style follows the Autodesk brand model shipped with the design
 * system: sentence case, active voice, no buzzwords, no emoji.
 */
import type { Industry, SizeBand } from "@/shared/enums";
import { INDUSTRY_LABELS, SIZE_BAND_DEFS } from "@/shared/enums";

export type BriefSourceRef = { kind: "doc" | "link"; title: string; url: string };

export type BriefContext = {
  playbookTitle: string;
  /** Never rendered into a prompt; it carries the retrieval confidentiality boundary. */
  customerId: string;
  customerName: string;
  industry: Industry;
  sizeBand: SizeBand;
  objective: string;
  focusAreas: string[];
  additionalContext: string;
  /** The reference links the consultant supplied in step 1. */
  briefSources: BriefSourceRef[];
};

/** Compact one-per-line form, used where a prompt needs to restate the brief inside a user message. */
export function describeBrief(brief: BriefContext): string {
  const size = SIZE_BAND_DEFS[brief.sizeBand];
  return [
    `Customer: ${brief.customerName}`,
    `Industry: ${INDUSTRY_LABELS[brief.industry]}`,
    `Organisation size: ${size.label} (${size.range} employees)`,
    `Objective: ${brief.objective}`,
    brief.focusAreas.length ? `Focus areas: ${brief.focusAreas.join(", ")}` : null,
    brief.additionalContext.trim() ? `Additional context: ${brief.additionalContext.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** House rules that apply to every generated word. Derived from the approved brand model. */
const HOUSE_STYLE = [
  "HOUSE STYLE",
  "- Voice is optimistic, trusted and human. Write in first and second person.",
  "- Sentence case everywhere. Active voice. Serial comma. No terminal punctuation on headings.",
  "- Brevity is a virtue. Prefer the shorter sentence and the plainer word.",
  "- Never use: cutting edge, impactful, leverage, pain point, revolutionary, synergy, purpose-built.",
  "- No emoji. No exclamation marks.",
  "- Autodesk product names are adjectives, never nouns or verbs (\"Autodesk Forma software\", not \"Forma-ing\").",
].join("\n");

const CORE_INSTRUCTIONS = [
  "INSTRUCTIONS",
  "1. Tailor all recommendations to the customer's industry, organisation size, stated objective, and selected focus areas.",
  "2. Treat the stated business objective as the primary outcome the playbook should support.",
  "3. Give greater emphasis to explicitly selected focus areas.",
  "4. Use optional sources, frameworks, and internal guidance when provided.",
  "5. Do not invent customer facts, regulations, organizational constraints, technologies, or business requirements that are not provided.",
  "6. If information is missing, make reasonable recommendations at a general level and clearly identify assumptions.",
  "7. Prefer practical, actionable guidance over generic advice.",
  "8. Keep recommendations appropriate for the maturity and scale implied by the organization size.",
  "9. Where relevant, identify dependencies, stakeholders, risks, governance considerations, and measurable outcomes.",
  "10. Maintain consistency with this brief throughout the entire response.",
].join("\n");

function customerContextBlock(brief: BriefContext): string {
  const size = SIZE_BAND_DEFS[brief.sizeBand];
  const optional = [
    brief.additionalContext.trim() ? brief.additionalContext.trim() : null,
    brief.briefSources.length
      ? ["Reference material the consultant supplied:", ...brief.briefSources.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}`)].join("\n")
      : null,
  ].filter(Boolean);

  return [
    "CUSTOMER CONTEXT",
    `- Customer: ${brief.customerName}`,
    `- Industry: ${INDUSTRY_LABELS[brief.industry]}`,
    `- Organization size: ${size.label}`,
    `- Approximate employee range: ${size.range}`,
    "",
    "BUSINESS OBJECTIVE",
    brief.objective.trim() || "Not stated. Keep recommendations general and say so.",
    "",
    "FOCUS AREAS",
    brief.focusAreas.length ? brief.focusAreas.map((f) => `- ${f}`).join("\n") : "None selected. Cover the objective broadly.",
    "",
    "OPTIONAL CONTEXT / SOURCES",
    optional.length ? optional.join("\n\n") : "None supplied.",
  ].join("\n");
}

export type PromptTask = "outline" | "draft" | "assistant";

const TASK_RULES: Record<PromptTask, string> = {
  outline: [
    "TASK",
    "You are planning the chapter structure of this playbook.",
    "Return only JSON. No preamble, no commentary, no markdown fence.",
    "Chapter and section titles must be specific to this customer's objective — a title that would fit any customer is a failed title.",
  ].join("\n"),
  draft: [
    "TASK",
    "You are writing one section of this playbook for the consultant to deliver to the customer.",
    "Ground every substantive claim in the excerpts provided with the section request.",
    "Output GitHub-flavoured markdown using only '# ' for the section title, '## ' for subheadings, plain paragraphs and '- ' bullets. No other markdown.",
  ].join("\n"),
  assistant: [
    "TASK",
    "You are the writing assistant inside Autodesk Playbook Manager, helping the consultant refine one section.",
    "Be brief and concrete. When you propose new wording, give it directly rather than describing it.",
    "Keep every source citation the consultant already has.",
  ].join("\n"),
};

/**
 * The system prompt for every call. The brief comes first so it frames everything that follows,
 * then the standing instructions, the task, and the house style.
 */
export function buildSystemPrompt(brief: BriefContext, task: PromptTask): string {
  return [
    "You are an expert business transformation and implementation advisor working with Autodesk Technical Advisory.",
    "",
    "Use the following customer brief as the primary context for all subsequent playbook recommendations.",
    "",
    customerContextBlock(brief),
    "",
    CORE_INSTRUCTIONS,
    "",
    TASK_RULES[task],
    "",
    HOUSE_STYLE,
    "",
    "Use this context to complete the task that follows.",
  ].join("\n");
}

// ---- Outline ---------------------------------------------------------------

export function outlinePrompt(brief: BriefContext): string {
  return [
    "Propose the chapter structure for this playbook.",
    "",
    "Return JSON of exactly this shape:",
    '{"chapters":[{"title":"...","sections":[{"title":"..."}]}]}',
    "",
    "Rules:",
    "- Six to eight chapters, ordered from vision through to roadmap.",
    "- Derive the chapters from the stated business objective. The structure must read as a plan for that objective specifically.",
    `- Every focus area listed in the brief must be covered by its own chapter or its own section: ${brief.focusAreas.length ? brief.focusAreas.join(", ") : "none listed, so cover the objective broadly"}.`,
    "- Give a chapter sections only where the topic genuinely splits; two to four sections at most.",
    "- Open with an executive summary chapter and close with an implementation roadmap.",
    `- Pitch the depth at a ${SIZE_BAND_DEFS[brief.sizeBand].label.toLowerCase()} organisation in ${INDUSTRY_LABELS[brief.industry]}.`,
  ].join("\n");
}

// ---- Drafting --------------------------------------------------------------

/** One retrieved passage from a source the consultant selected. */
export type SourceExcerpt = {
  n: number;
  sourceTitle: string;
  ownerOrg: string;
  year: number | null;
  pageNo: number | null;
  text: string;
};

export function renderExcerpts(excerpts: SourceExcerpt[]): string {
  return excerpts
    .map((e) => {
      const where = [e.ownerOrg, e.year ? String(e.year) : null, e.pageNo ? `p. ${e.pageNo}` : null].filter(Boolean).join(", ");
      return `[${e.n}] ${e.sourceTitle}${where ? ` (${where})` : ""}\n${e.text.trim()}`;
    })
    .join("\n\n");
}

export function draftPrompt(params: { sectionTitle: string; chapterTitle: string; excerpts: SourceExcerpt[] }): string {
  const { sectionTitle, chapterTitle, excerpts } = params;
  return [
    `Write the "${sectionTitle}" section of the chapter "${chapterTitle}".`,
    "",
    excerpts.length
      ? [
          "These are the most relevant passages from the sources the consultant selected for this section.",
          "Base the section on them and do not introduce claims they do not support.",
          "",
          renderExcerpts(excerpts),
        ].join("\n")
      : "No sources were selected for this section, so keep the guidance general, state that it is general, and do not cite anything.",
    "",
    "Structure:",
    `- Start with "# ${sectionTitle}".`,
    "- One short opening paragraph naming what this section decides for the customer.",
    "- A '## Key objectives' list of three to four bullets.",
    "- A '## Expected outcomes' list of three to four bullets.",
    "- A closing paragraph under '## How to use this section' telling the consultant how to run it with the customer.",
    "Keep the whole section between 200 and 350 words.",
  ].join("\n");
}

export function regeneratePrompt(params: { sectionTitle: string; current: string; excerpts: SourceExcerpt[]; instruction?: string }): string {
  return [
    `Rewrite the "${params.sectionTitle}" section.`,
    params.instruction ? `Specific instruction: ${params.instruction}` : "Improve clarity and tighten the writing. Keep every factual claim.",
    "",
    // The previous version dropped the sources here, so a rewrite quietly lost its grounding.
    params.excerpts.length ? ["Keep the section grounded in these passages from the selected sources:", "", renderExcerpts(params.excerpts)].join("\n") : "",
    "",
    "Current text:",
    params.current,
    "",
    "Return the full replacement section in the same markdown structure. Do not add commentary.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

// ---- Assistant -------------------------------------------------------------

export function introSuggestionPrompt(brief: BriefContext, sectionTitle: string): string {
  return [
    `Write a two-sentence customer-specific introduction for the "${sectionTitle}" section.`,
    "",
    `Name ${brief.customerName} explicitly, reference its industry and size, and connect to the stated objective.`,
    "Return only the two sentences, no heading and no quotation marks.",
  ].join("\n");
}

/**
 * The assistant answers with a JSON envelope so one turn can both reply and propose a rewrite.
 * `contentMd` is always the COMPLETE section — a partial reply would silently truncate the document.
 */
export function assistantTurnPrompt(params: { sectionTitle: string; current: string; message: string; allowEdit: boolean }): string {
  const { sectionTitle, current, message, allowEdit } = params;
  return [
    `The consultant is working on the "${sectionTitle}" section.`,
    "",
    current.trim() ? ["Current text of the section:", "---", current, "---"].join("\n") : "The section has no text yet.",
    "",
    `They said: ${message}`,
    "",
    "Reply with JSON only, in one of these two shapes:",
    '{"action":"reply","reply":"..."}',
    allowEdit
      ? '{"action":"edit","reply":"...","contentMd":"...","summary":"..."}'
      : "(editing is unavailable for this turn, so only the reply shape is valid)",
    "",
    "Rules:",
    '- Use "edit" only when they asked you to change the section text. Questions, opinions and explanations are "reply".',
    ...(allowEdit
      ? [
          "- contentMd must be the complete section after your change, not a fragment and not a diff.",
          "- Never remove content they did not ask you to remove.",
          "- Keep the section's markdown vocabulary: '# ' for the title, '## ' for subheadings, plain paragraphs, and '- ' bullets. Nothing else.",
          '- summary is one short past-tense sentence, for example "Shortened Key objectives from four bullets to three".',
          "- reply is what you say in the chat: one or two sentences, not a copy of the section.",
        ]
      : ["- Explain what you would change rather than changing it."]),
  ].join("\n");
}
