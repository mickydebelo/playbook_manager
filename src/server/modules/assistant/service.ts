import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import { assistantMessages } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { extractJson, invokeModel, isAiConfigured } from "../../ai/aps-client";
import { assistantTurnPrompt, buildSystemPrompt, introSuggestionPrompt } from "../../ai/prompts/playbook";
import { AppError, conflict } from "../../http/errors";
import type { AssistantReply } from "@/shared/contracts";
import { loadBriefContext } from "../jobs/handlers/context";
import { requireSection } from "../sections/service";

/** How many stored messages are replayed to the model. */
const HISTORY_MESSAGES = 10;
/** Above this, a full rewrite cannot be returned safely inside the token budget, so the turn is reply-only. */
const MAX_EDITABLE_CHARS = 12_000;
/** A rewrite has to fit; a truncated one would silently delete the tail of the section. */
const ASSISTANT_MAX_TOKENS = 1_600;

export type AssistantTurn = { id: string; role: "user" | "assistant"; body: string; createdAt: string };

/** The envelope the model is asked to return. Validated server-side and never sent to the client as-is. */
const envelopeSchema = z.union([
  z.object({ action: z.literal("reply"), reply: z.string().min(1) }),
  z.object({
    action: z.literal("edit"),
    /**
     * Optional on purpose. The fast model often returns the rewrite and the summary but skips the
     * chat line, and requiring it threw away a perfectly good edit over a missing pleasantry —
     * and then printed the raw envelope into the conversation. The summary stands in for it.
     */
    reply: z.string().optional(),
    contentMd: z.string().min(1),
    summary: z.string().min(1),
  }),
]);

type Envelope = z.infer<typeof envelopeSchema>;

function replyOf(envelope: Envelope): string {
  if (envelope.action === "reply") return envelope.reply;
  return envelope.reply?.trim() || envelope.summary;
}

/**
 * The model returned something that is not a usable envelope. Passing the text straight through
 * is right for a prose answer but prints a JSON blob into the chat when the envelope was merely
 * malformed or cut off, so those two cases get a plain sentence instead.
 */
function fallbackReply(text: string, stopReason: string | null): string {
  if (stopReason === "max_tokens")
    return "That answer ran longer than I can return in one go. Ask me for a smaller change, or use “Regenerate section” for a full rewrite.";
  if (/^\s*(```|[[{])/.test(text)) return "I could not turn that into a usable edit. Tell me more specifically what to change.";
  return text;
}

export async function listAssistantMessages(db: Db, user: CurrentUser, sectionId: string): Promise<AssistantTurn[]> {
  await requireSection(db, user, sectionId, false);
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.sectionId, sectionId))
    .orderBy(asc(assistantMessages.createdAt));
  return rows.map((r) => ({ id: r.id, role: r.role, body: r.body, createdAt: r.createdAt.toISOString() }));
}

/**
 * Bedrock rejects a message list whose roles do not alternate. A turn that failed mid-flight used to
 * leave an orphaned user row, which then broke every later turn permanently. New turns are written
 * atomically so that cannot recur, and this heals threads already damaged in the database.
 */
export function toAlternating(rows: { role: "user" | "assistant"; body: string }[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of rows) {
    if (out.length === 0 && row.role === "assistant") continue; // a thread must open with the user
    if (out.length && out[out.length - 1]!.role === row.role) {
      out[out.length - 1] = { role: row.role, content: row.body }; // keep the most recent of a run
      continue;
    }
    out.push({ role: row.role, content: row.body });
  }
  return out;
}

/**
 * One assistant turn about a single section. Runs inline on the fast model — the gateway answers a
 * short prompt in about a second, so a background job would only add latency.
 *
 * The assistant never writes to the section. It returns a proposed replacement and the client
 * applies it, which keeps the user's unsaved keystrokes authoritative and removes any lost-update
 * race with the editor's autosave.
 */
export async function sendAssistantMessage(
  db: Db,
  user: CurrentUser,
  sectionId: string,
  input: { message: string; contentMd?: string; baseSavedAt: string | null; allowEdit: boolean },
): Promise<AssistantReply> {
  // A reader still gets to ask questions; only an editor can be offered a rewrite.
  const section = await requireSection(db, user, sectionId, input.allowEdit);
  if (!isAiConfigured()) throw new AppError("internal", "The AI gateway is not configured");

  const storedAt = section.contentSavedAt?.toISOString() ?? null;
  if (input.allowEdit && input.contentMd !== undefined && storedAt !== null && input.baseSavedAt !== storedAt) {
    // Refuse before spending a model call on a document the user is no longer looking at.
    throw conflict("This section changed since you opened it. Reload to see the latest version.");
  }

  const current = input.contentMd ?? section.contentMd;
  // Never truncate on the edit path: the model is asked for the complete section back, so feeding
  // it a prefix would quietly delete everything after the cut.
  const allowEdit = input.allowEdit && current.length <= MAX_EDITABLE_CHARS;

  const brief = await loadBriefContext(db, section.playbookId);
  const history = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.sectionId, sectionId))
    .orderBy(asc(assistantMessages.createdAt));

  // Normalise the history *with* the new turn appended. Normalising first and appending after
  // would still emit two consecutive user messages when the stored thread ends on a user row.
  const messages = toAlternating([
    ...history.slice(-HISTORY_MESSAGES).map((m) => ({ role: m.role, body: m.body })),
    { role: "user" as const, body: assistantTurnPrompt({ sectionTitle: section.title, current, message: input.message, allowEdit }) },
  ]);

  const { text, stopReason } = await invokeModel({
    tier: "fast",
    system: buildSystemPrompt(brief, "assistant"),
    maxTokens: ASSISTANT_MAX_TOKENS,
    temperature: 0.4,
    messages,
  });

  const parsed = envelopeSchema.safeParse(extractJson(text));
  // If the model answered in prose rather than JSON, treat it as a plain reply rather than failing.
  let reply = parsed.success ? replyOf(parsed.data) : fallbackReply(text, stopReason);
  let proposal: AssistantReply["proposal"] = null;

  if (parsed.success && parsed.data.action === "edit" && allowEdit) {
    const candidate = parsed.data.contentMd.trim();
    if (stopReason === "max_tokens") {
      reply = "That rewrite is longer than I can return in one go. Try “Regenerate section” for a full rewrite.";
    } else if (!candidate) {
      reply = "I could not produce a usable rewrite. Tell me more specifically what to change.";
    } else if (/^\s*(###|\||\d+\.)\s/m.test(candidate)) {
      // The rich view only renders '# ', '## ', paragraphs and '- ' bullets.
      reply = "I tried to use formatting this editor cannot show. Ask me again and I will keep to headings and bullets.";
    } else {
      proposal = { contentMd: candidate, summary: parsed.data.summary.trim(), baseSavedAt: storedAt };
    }
  }

  // Both rows are written together and only after a successful call, so a failure can never leave
  // an orphaned user message behind. Only the summary is stored for an edit — persisting the whole
  // rewritten section would balloon every later turn's replayed history.
  const saved = await db.transaction(async (tx) => {
    await tx.insert(assistantMessages).values({ playbookId: section.playbookId, sectionId, role: "user", body: input.message });
    const [row] = await tx
      .insert(assistantMessages)
      .values({ playbookId: section.playbookId, sectionId, role: "assistant", body: proposal ? `${reply}\n\n(${proposal.summary})` : reply })
      .returning();
    return row!;
  });

  return { id: saved.id, role: "assistant", body: saved.body, createdAt: saved.createdAt.toISOString(), proposal };
}

/** The design's "Add a short customer-specific introduction for {customer}?" suggestion. */
export async function suggestIntro(db: Db, user: CurrentUser, sectionId: string): Promise<string> {
  const section = await requireSection(db, user, sectionId, true);
  if (!isAiConfigured()) throw new AppError("internal", "The AI gateway is not configured");
  const brief = await loadBriefContext(db, section.playbookId);
  const { text } = await invokeModel({
    tier: "fast",
    maxTokens: 300,
    temperature: 0.5,
    system: buildSystemPrompt(brief, "assistant"),
    messages: [{ role: "user", content: introSuggestionPrompt(brief, section.title) }],
  });
  return text;
}
