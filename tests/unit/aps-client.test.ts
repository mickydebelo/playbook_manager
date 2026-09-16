import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedText, extractJson, getAccessToken, invokeJson, invokeModel, resetTokenCache } from "@/server/ai/aps-client";
import { resetEnvCache } from "@/server/env";

const TOKEN_URL = "https://developer-stg.api.autodesk.com/authentication/v2/token";
const FAST = "https://developer-stg.api.autodesk.com/ais/v1/endpoints/amp-pid-1728-anthropic-claude-haiku-4-5-20251001-v1-0/v1/invoke";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const tokenBody = (t = "tok-1", expires = 3600) => ({ access_token: t, expires_in: expires });
const completion = (text: string) => ({
  model: "claude-haiku",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 4 },
});

let calls: { url: string; init?: RequestInit }[];

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
}

beforeEach(() => {
  resetTokenCache();
  process.env.APS_CLIENT_ID = "test-id";
  process.env.APS_CLIENT_SECRET = "test-secret";
  resetEnvCache(); // the parsed environment is memoised, so re-read it per test
});
afterEach(() => vi.unstubAllGlobals());

describe("APS token handling", () => {
  it("requests a token with HTTP Basic and the client-credentials grant", async () => {
    mockFetch(() => jsonResponse(tokenBody()));
    expect(await getAccessToken()).toBe("tok-1");
    const [call] = calls;
    expect(call!.url).toBe(TOKEN_URL);
    const headers = call!.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from("test-id:test-secret").toString("base64")}`);
    expect(call!.init!.body).toBe("grant_type=client_credentials&scope=data:read");
  });

  it("caches the token across calls and shares one request between concurrent callers", async () => {
    mockFetch(() => jsonResponse(tokenBody()));
    const [a, b] = await Promise.all([getAccessToken(), getAccessToken()]);
    expect([a, b]).toEqual(["tok-1", "tok-1"]);
    await getAccessToken();
    expect(calls).toHaveLength(1);
  });

  it("refetches when the cached token is about to expire", async () => {
    let n = 0;
    mockFetch(() => jsonResponse(tokenBody(`tok-${++n}`, 30))); // 30s < the 60s skew, so never cacheable
    expect(await getAccessToken()).toBe("tok-1");
    expect(await getAccessToken()).toBe("tok-1"); // still inside the 30s floor
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("reports a failed token request as an internal error", async () => {
    mockFetch(() => new Response("nope", { status: 401 }));
    await expect(getAccessToken()).rejects.toMatchObject({ code: "internal" });
  });

  it("fails clearly when credentials are absent", async () => {
    process.env.APS_CLIENT_ID = "";
    resetEnvCache();
    mockFetch(() => jsonResponse(tokenBody()));
    await expect(getAccessToken()).rejects.toThrow(/not configured/);
  });
});

describe("invokeModel", () => {
  it("posts the Bedrock-shaped body to the fast deployment and returns the text", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse(completion("Hello"))));
    const out = await invokeModel({ messages: [{ role: "user", content: "hi" }], system: "be brief", maxTokens: 50, temperature: 0.2 });
    expect(out).toMatchObject({ text: "Hello", inputTokens: 10, outputTokens: 4, stopReason: "end_turn" });
    const invoke = calls.find((c) => c.url !== TOKEN_URL)!;
    expect(invoke.url).toBe(FAST);
    expect(JSON.parse(String(invoke.init!.body))).toEqual({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 50,
      messages: [{ role: "user", content: "hi" }],
      system: "be brief",
      temperature: 0.2,
    });
  });

  it("uses the quality deployment when asked", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse(completion("x"))));
    await invokeModel({ tier: "quality", messages: [{ role: "user", content: "hi" }] });
    expect(calls.find((c) => c.url !== TOKEN_URL)!.url).toContain("claude-opus-4-1");
  });

  it("refreshes the token once and retries on a 401 from the gateway", async () => {
    let tokens = 0;
    let invokes = 0;
    mockFetch((url) => {
      if (url === TOKEN_URL) return jsonResponse(tokenBody(`tok-${++tokens}`));
      return ++invokes === 1 ? new Response("expired", { status: 401 }) : jsonResponse(completion("recovered"));
    });
    expect((await invokeModel({ messages: [{ role: "user", content: "hi" }] })).text).toBe("recovered");
    expect(tokens).toBe(2);
    expect(invokes).toBe(2);
  });

  it("surfaces a non-401 gateway error", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : new Response("boom", { status: 500 })));
    await expect(invokeModel({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "internal" });
  });

  it("rejects an empty completion", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse({ content: [] })));
    await expect(invokeModel({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/no text/);
  });
});

describe("extractJson", () => {
  it("parses a bare object or array", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("[1,2]")).toEqual([1, 2]);
  });
  it("unwraps a fenced block and ignores surrounding prose", () => {
    expect(extractJson('Sure!\n```json\n{"a":[1,2]}\n```\nHope that helps.')).toEqual({ a: [1, 2] });
    expect(extractJson('Here you go: {"a":1} — done')).toEqual({ a: 1 });
  });
  it("handles braces inside strings", () => {
    expect(extractJson('{"a":"} not the end {","b":2}')).toEqual({ a: "} not the end {", b: 2 });
  });
  it("returns null when there is no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{unbalanced")).toBeNull();
  });
});

describe("invokeJson", () => {
  it("parses and validates the reply", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse(completion('```json\n{"titles":["A"]}\n```'))));
    const out = await invokeJson({
      messages: [{ role: "user", content: "outline" }],
      shape: (v) => v as { titles: string[] },
    });
    expect(out.titles).toEqual(["A"]);
  });
  it("errors when the reply is not JSON", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse(completion("sorry, no"))));
    await expect(invokeJson({ messages: [{ role: "user", content: "x" }], shape: (v) => v })).rejects.toThrow(/not valid JSON/);
  });
});

describe("embedText", () => {
  it("sends a bare inputText and returns the vector", async () => {
    const vec = Array.from({ length: 1024 }, (_, i) => i / 1024);
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse({ embedding: vec })));
    expect(await embedText("hello")).toHaveLength(1024);
    const invoke = calls.find((c) => c.url !== TOKEN_URL)!;
    expect(invoke.url).toContain("titan-embed-text");
    expect(JSON.parse(String(invoke.init!.body))).toEqual({ inputText: "hello" });
  });
  it("rejects empty input and a wrong-sized vector", async () => {
    mockFetch((url) => (url === TOKEN_URL ? jsonResponse(tokenBody()) : jsonResponse({ embedding: [1, 2, 3] })));
    await expect(embedText("   ")).rejects.toMatchObject({ code: "validation_failed" });
    await expect(embedText("hello")).rejects.toThrow(/1024 dimensions/);
  });
});
