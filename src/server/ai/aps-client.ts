import { getEnv } from "../env";
import { AppError } from "../http/errors";

/**
 * Client for the Autodesk Platform Services AI gateway (docs/APS_REST_API.md).
 *
 * OAuth2 client credentials, cached until shortly before expiry. The gateway is Bedrock-shaped:
 * the deployment name goes in the URL and the body is the Anthropic-on-Bedrock schema.
 * Only `/v1/invoke` is used — streaming is documented as unverified.
 */
export type ModelTier = "fast" | "quality";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type InvokeOptions = {
  tier?: ModelTier;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Overrides the tier default. Opus is roughly six times slower than Haiku. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type InvokeResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
};

const TIER_TIMEOUT_MS: Record<ModelTier, number> = { fast: 45_000, quality: 180_000 };
/** Refresh this long before the token actually expires. */
const TOKEN_SKEW_MS = 60_000;

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let inFlightToken: Promise<string> | null = null;

function deploymentFor(tier: ModelTier): string {
  const env = getEnv();
  return tier === "quality" ? env.APS_MODEL_QUALITY : env.APS_MODEL_FAST;
}

function requireCredentials(): { id: string; secret: string } {
  const env = getEnv();
  if (!env.APS_CLIENT_ID || !env.APS_CLIENT_SECRET) {
    throw new AppError("internal", "APS_CLIENT_ID and APS_CLIENT_SECRET are not configured");
  }
  return { id: env.APS_CLIENT_ID, secret: env.APS_CLIENT_SECRET };
}

/** Client-credentials token, cached across calls. Concurrent callers share one request. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!forceRefresh && inFlightToken) return inFlightToken;

  const { id, secret } = requireCredentials();
  const env = getEnv();
  const request = (async () => {
    const res = await fetch(`${env.APS_BASE_URL}/authentication/v2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=data:read",
    });
    if (!res.ok) {
      throw new AppError("internal", `APS token request failed (${res.status})`, await safeBody(res));
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new AppError("internal", "APS token response had no access_token");
    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max((body.expires_in ?? 3600) * 1000 - TOKEN_SKEW_MS, 30_000),
    };
    return cachedToken.value;
  })();

  inFlightToken = request;
  try {
    return await request;
  } finally {
    inFlightToken = null;
  }
}

/** Test helper: drop the cached token. */
export function resetTokenCache(): void {
  cachedToken = null;
  inFlightToken = null;
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

async function postToEndpoint(deployment: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const env = getEnv();
  const url = `${env.APS_BASE_URL}/ais/v1/endpoints/${deployment}/v1/invoke`;
  const timer = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;

  const send = async (token: string) =>
    fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: combined,
    });

  let res = await send(await getAccessToken());
  // Tokens expire; one forced refresh and retry covers the boundary case.
  if (res.status === 401) res = await send(await getAccessToken(true));
  return res;
}

/** Single-turn or multi-turn completion. Returns the concatenated text blocks. */
export async function invokeModel(options: InvokeOptions): Promise<InvokeResult> {
  const tier = options.tier ?? "fast";
  const deployment = deploymentFor(tier);
  const payload: Record<string, unknown> = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: options.maxTokens ?? 1024,
    messages: options.messages,
  };
  if (options.system) payload.system = options.system;
  if (options.temperature !== undefined) payload.temperature = options.temperature;

  let res: Response;
  try {
    res = await postToEndpoint(deployment, payload, options.timeoutMs ?? TIER_TIMEOUT_MS[tier], options.signal);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const aborted = err instanceof Error && err.name === "TimeoutError";
    throw new AppError("internal", aborted ? `The ${tier} model timed out` : "Could not reach the AI gateway", String(err));
  }
  if (!res.ok) throw new AppError("internal", `AI gateway returned ${res.status}`, await safeBody(res));

  const body = (await res.json()) as {
    model?: string;
    content?: { type: string; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (body.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
  if (!text) throw new AppError("internal", "AI gateway returned no text");
  return {
    text,
    model: body.model ?? deployment,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    stopReason: body.stop_reason ?? null,
  };
}

/**
 * Asks for JSON and parses it. The models occasionally wrap JSON in prose or a fenced block,
 * so the first balanced JSON value in the reply is extracted rather than trusting the whole string.
 */
export async function invokeJson<T>(options: InvokeOptions & { shape: (value: unknown) => T }): Promise<T> {
  const { text } = await invokeModel(options);
  const candidate = extractJson(text);
  if (candidate === null) throw new AppError("internal", "AI reply was not valid JSON", text.slice(0, 500));
  try {
    return options.shape(candidate);
  } catch (err) {
    throw new AppError("internal", "AI reply did not match the expected shape", String(err));
  }
}

/** Finds the first balanced `{...}` or `[...]` in a string and parses it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenced?.[1] ?? text;
  const start = haystack.search(/[[{]/);
  if (start === -1) return null;
  const open = haystack[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(haystack.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export const EMBEDDING_DIMENSIONS = 1024;

/** Titan Text Embeddings v2. Different payload shape from the chat models: a bare inputText. */
export async function embedText(text: string, signal?: AbortSignal): Promise<number[]> {
  const env = getEnv();
  const trimmed = text.trim();
  if (!trimmed) throw new AppError("validation_failed", "Cannot embed empty text");
  const res = await postToEndpoint(env.APS_EMBED_MODEL, { inputText: trimmed.slice(0, 40_000) }, 60_000, signal);
  if (!res.ok) throw new AppError("internal", `Embedding request returned ${res.status}`, await safeBody(res));
  const body = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(body.embedding) || body.embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new AppError("internal", `Embedding response was not ${EMBEDDING_DIMENSIONS} dimensions`);
  }
  return body.embedding;
}

/** The gateway exposes no batch endpoint, so this is sequential with a small concurrency cap. */
export async function embedMany(texts: string[], concurrency = 3): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, async () => {
    while (cursor < texts.length) {
      const i = cursor++;
      out[i] = await embedText(texts[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export function isAiConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.APS_CLIENT_ID && env.APS_CLIENT_SECRET);
}
