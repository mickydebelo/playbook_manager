import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { assistantMessages } from "@/server/db/schema";
import { resetTokenCache } from "@/server/ai/aps-client";
import { resetEnvCache } from "@/server/env";
import { createPlaybook } from "@/server/modules/playbooks/service";
import { addChapter, addSection, getSection, saveSectionContent } from "@/server/modules/sections/service";
import { sendAssistantMessage, toAlternating } from "@/server/modules/assistant/service";
import { createTestContext, destroyTestContext, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
let sectionId: string;

const TOKEN_URL = "https://developer-stg.api.autodesk.com/authentication/v2/token";

/** Mocks the gateway: a token, then one completion whose text is `body`. */
function mockGateway(body: string | (() => never), stopReason = "end_turn") {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === TOKEN_URL) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      if (typeof body === "function") body();
      return new Response(
        JSON.stringify({ model: "haiku", content: [{ type: "text", text: body as string }], stop_reason: stopReason, usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200 },
      );
    }),
  );
  return calls;
}
const envelope = (o: Record<string, unknown>) => JSON.stringify(o);

beforeAll(async () => {
  ctx = await createTestContext();
  const pb = await createPlaybook(ctx.db, ctx.author, { ...validBrief, customerName: "Assistant Co" });
  const chapter = await addChapter(ctx.db, ctx.author, pb.id, { title: "Chapter" });
  sectionId = (await addSection(ctx.db, ctx.author, chapter.id, { title: "Docs workflow", parentSectionId: null })).id;
});
afterAll(async () => destroyTestContext(ctx));

beforeEach(async () => {
  await ctx.db.delete(assistantMessages);
  resetTokenCache();
  process.env.APS_CLIENT_ID = "test-id";
  process.env.APS_CLIENT_SECRET = "test-secret";
  resetEnvCache();
});
afterEach(() => vi.unstubAllGlobals());

async function seedContent(text: string) {
  const current = await getSection(ctx.db, ctx.author, sectionId);
  return saveSectionContent(ctx.db, ctx.author, sectionId, { contentMd: text, baseSavedAt: current.contentSavedAt, reason: "edit" });
}

describe("toAlternating", () => {
  it("leaves a healthy thread untouched", () => {
    const rows = [
      { role: "user" as const, body: "a" },
      { role: "assistant" as const, body: "b" },
    ];
    expect(toAlternating(rows)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("heals a thread broken by orphaned user rows", () => {
    const rows = [
      { role: "user" as const, body: "first" },
      { role: "user" as const, body: "second" },
      { role: "user" as const, body: "third" },
      { role: "assistant" as const, body: "reply" },
    ];
    expect(toAlternating(rows)).toEqual([
      { role: "user", content: "third" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("drops a leading assistant turn, which the API rejects", () => {
    expect(toAlternating([{ role: "assistant", body: "hello" }, { role: "user", body: "hi" }])).toEqual([{ role: "user", content: "hi" }]);
  });

  it("handles an empty thread", () => {
    expect(toAlternating([])).toEqual([]);
  });
});

describe("sendAssistantMessage", () => {
  it("returns a proposal and writes nothing to the section itself", async () => {
    await seedContent("# Docs workflow\n\nOriginal text.");
    const before = await getSection(ctx.db, ctx.author, sectionId);
    mockGateway(envelope({ action: "edit", reply: "Shortened it.", contentMd: "# Docs workflow\n\nShorter.", summary: "Tightened the opening" }));

    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, {
      message: "shorten this",
      contentMd: before.contentMd,
      baseSavedAt: before.contentSavedAt,
      allowEdit: true,
    });

    expect(reply.proposal?.contentMd).toBe("# Docs workflow\n\nShorter.");
    expect(reply.proposal?.summary).toBe("Tightened the opening");
    // the section is untouched — the client applies the proposal
    const after = await getSection(ctx.db, ctx.author, sectionId);
    expect(after.contentMd).toBe(before.contentMd);
    expect(after.contentSavedAt).toBe(before.contentSavedAt);
  });

  it("returns no proposal for a plain question", async () => {
    await seedContent("# Docs workflow\n\nSome text.");
    mockGateway(envelope({ action: "reply", reply: "It reads well." }));
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "how does it read?", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal).toBeNull();
    expect(reply.body).toContain("It reads well.");
  });

  it("refuses a stale edit before spending a model call", async () => {
    const saved = await seedContent("# Docs workflow\n\nFresh text.");
    const calls = mockGateway(envelope({ action: "reply", reply: "unused" }));
    await expect(
      sendAssistantMessage(ctx.db, ctx.author, sectionId, {
        message: "shorten",
        contentMd: "stale buffer",
        baseSavedAt: new Date(new Date(saved.contentSavedAt!).getTime() - 60_000).toISOString(),
        allowEdit: true,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(calls).toHaveLength(0); // no token fetch, no model call
  });

  it("leaves no orphaned user row when the gateway fails", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway(() => {
      throw new Error("gateway down");
    });
    await expect(
      sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "shorten", baseSavedAt: null, allowEdit: true }),
    ).rejects.toBeTruthy();
    const rows = await ctx.db.select().from(assistantMessages).where(eq(assistantMessages.sectionId, sectionId));
    expect(rows).toHaveLength(0);
  });

  it("persists the user and assistant turns together, storing the summary rather than the rewrite", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway(envelope({ action: "edit", reply: "Done.", contentMd: "# Docs workflow\n\nA much longer rewritten body.", summary: "Rewrote the body" }));
    await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "rewrite", baseSavedAt: null, allowEdit: true });
    const rows = await ctx.db.select().from(assistantMessages).where(eq(assistantMessages.sectionId, sectionId));
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(rows[1]!.body).toContain("Rewrote the body");
    expect(rows[1]!.body).not.toContain("much longer rewritten body"); // history stays small
  });

  it("rejects a truncated rewrite rather than saving half a section", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway(envelope({ action: "edit", reply: "Here.", contentMd: "# Docs workflow\n\nHalf a rewr", summary: "x" }), "max_tokens");
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "rewrite", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal).toBeNull();
    expect(reply.body).toContain("Regenerate section");
  });

  it("rejects markdown the editor cannot render", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway(envelope({ action: "edit", reply: "Added a table.", contentMd: "# Docs workflow\n\n| a | b |\n| - | - |", summary: "x" }));
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "add a table", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal).toBeNull();
  });

  /**
   * Observed against the real gateway: the fast model returns the rewrite and the summary but no
   * chat line. Requiring one discarded a valid edit and printed the raw envelope into the chat.
   */
  it("still proposes the edit when the model omits the chat line, using the summary as the reply", async () => {
    await seedContent("# Docs workflow\n\nOriginal text.");
    mockGateway(envelope({ action: "edit", contentMd: "# Docs workflow\n\nRewritten body.", summary: "Added a consultation checkpoint" }));
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "add a checkpoint", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal?.contentMd).toBe("# Docs workflow\n\nRewritten body.");
    expect(reply.body).toContain("Added a consultation checkpoint");
    expect(reply.body).not.toContain("contentMd"); // never leak the envelope into the conversation
  });

  it("does not print a raw JSON envelope into the chat when it cannot be parsed", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway('```json\n{"action":"edit","contentMd":"# Docs workflow\\n\\nHalf a rewri');
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "rewrite", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal).toBeNull();
    expect(reply.body).not.toContain("contentMd");
    expect(reply.body).toContain("more specifically what to change");
  });

  it("degrades to a plain reply when the model answers in prose", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway("I think the governance paragraph could be clearer.");
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "thoughts?", baseSavedAt: null, allowEdit: true });
    expect(reply.proposal).toBeNull();
    expect(reply.body).toContain("governance paragraph");
  });

  it("never proposes an edit when editing is not allowed", async () => {
    await seedContent("# Docs workflow\n\nText.");
    mockGateway(envelope({ action: "edit", reply: "Shortened.", contentMd: "# Docs workflow\n\nShort.", summary: "x" }));
    const reply = await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "shorten", baseSavedAt: null, allowEdit: false });
    expect(reply.proposal).toBeNull();
  });

  it("replays a previously broken thread as alternating roles", async () => {
    await seedContent("# Docs workflow\n\nText.");
    // three orphaned user rows, as the old code could leave behind
    await ctx.db.insert(assistantMessages).values([
      { playbookId: (await getSection(ctx.db, ctx.author, sectionId)).playbookId, sectionId, role: "user", body: "one" },
      { playbookId: (await getSection(ctx.db, ctx.author, sectionId)).playbookId, sectionId, role: "user", body: "two" },
    ]);
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === TOKEN_URL) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ content: [{ type: "text", text: envelope({ action: "reply", reply: "ok" }) }], stop_reason: "end_turn" }), { status: 200 });
      }),
    );
    await sendAssistantMessage(ctx.db, ctx.author, sectionId, { message: "three", baseSavedAt: null, allowEdit: true });
    const sent = JSON.parse(bodies[0]!).messages as { role: string }[];
    for (let i = 1; i < sent.length; i++) expect(sent[i]!.role).not.toBe(sent[i - 1]!.role);
    expect(sent[sent.length - 1]!.role).toBe("user");
  });
});
