# Calling Claude via APS REST API

Direct `curl` access to the Autodesk Platform Services (APS) AI Services gateway — no
Python, no database, no repo code required. Verified working against staging on 2026-09-16.

## Available models

| Model | Deployment name (use in URL) | Underlying model |
| --- | --- | --- |
| Claude Opus 4.1 | `amp-pid-1728-anthropic-claude-opus-4-1-20250805-v1-0` | `claude-opus-4-1-20250805` |
| Claude Haiku 4.5 | `amp-pid-1728-anthropic-claude-haiku-4-5-20251001-v1-0` | `anthropic.claude-haiku-4-5-20251001-v1:0` |
| Titan Text Embeddings v2 | `amp-pid-1728-amazon-titan-embed-text-v2-0` | 1024-dimension vectors |

Base URL (staging): `https://developer-stg.api.autodesk.com`

## 1. Get an access token

OAuth2 client credentials with HTTP Basic auth. Tokens expire (see `expires_in`,
typically 3600s), so re-run this when you start getting `401`s.

```bash
export APS_CLIENT_ID='your_client_id'
read -rs APS_CLIENT_SECRET && export APS_CLIENT_SECRET   # avoids shell history

export APS_TOKEN=$(curl -s \
  -u "$APS_CLIENT_ID:$APS_CLIENT_SECRET" \
  -d 'grant_type=client_credentials&scope=data:read' \
  https://developer-stg.api.autodesk.com/authentication/v2/token \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
```

## 2. Invoke a model

The deployment name goes in the URL path; the body is the standard
Anthropic-on-Bedrock schema. `anthropic_version` and `max_tokens` are required.

### Claude Haiku 4.5 (fast, cheap)

```bash
curl -s -X POST \
  "https://developer-stg.api.autodesk.com/ais/v1/endpoints/amp-pid-1728-anthropic-claude-haiku-4-5-20251001-v1-0/v1/invoke" \
  -H "Authorization: Bearer $APS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 1024,
    "temperature": 0.7,
    "messages": [
      {"role": "user", "content": "In one sentence, what is retrieval augmented generation?"}
    ]
  }'
```

### Claude Opus 4.1 (stronger, slower)

Identical call — only the deployment name in the path changes.

```bash
curl -s -X POST \
  "https://developer-stg.api.autodesk.com/ais/v1/endpoints/amp-pid-1728-anthropic-claude-opus-4-1-20250805-v1-0/v1/invoke" \
  -H "Authorization: Bearer $APS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 1024,
    "temperature": 0.7,
    "messages": [
      {"role": "user", "content": "In one sentence, what is retrieval augmented generation?"}
    ]
  }'
```

### Extract just the answer text

```bash
... | python3 -c 'import sys,json; print(json.load(sys.stdin)["content"][0]["text"])'
```

## 3. Response shape

```json
{
  "model": "claude-opus-4-1-20250805",
  "id": "msg_bdrk_01Er3tRwArmgigB7PEM9LxFn",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Retrieval augmented generation is ..."}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 19, "output_tokens": 37}
}
```

Read the answer from `content[0].text` — this is exactly what `src/llms/bedrock.py` does.

## Embeddings

Different payload shape: a bare `inputText`, returning an `embedding` array of 1024 floats.

```bash
curl -s -X POST \
  "https://developer-stg.api.autodesk.com/ais/v1/endpoints/amp-pid-1728-amazon-titan-embed-text-v2-0/v1/invoke" \
  -H "Authorization: Bearer $APS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"inputText": "hello world"}'
```

## Notes and gotchas

- **Multi-turn**: append to the `messages` array with alternating `user` / `assistant`
  roles. A system prompt goes in a top-level `"system"` field, not in `messages`.
- **Latency**: Opus 4.1 is markedly slower than Haiku 4.5 — roughly 18s versus 2s on a
  short prompt. Budget accordingly for RAG-augmented prompts with large context.
- **Response metadata varies** between the two endpoints. Opus omits `stop_details`,
  `cache_creation`, and `service_tier`, which Haiku includes. Don't depend on those fields.
- **No image generation.** Claude is text-only output; it accepts images as input but
  cannot produce them. No image model is deployed on this project.
- **No model discovery.** `/ais/v1/endpoints`, `/ais/v1/models`, `/ais/v1/deployments`
  and friends all return 404. Only `/ais/v1/endpoints/{name}/v1/invoke` exists, so there
  is no way to enumerate the catalog — ask the `amp-pid-1728` project owners.
- **No OpenAI models.** The gateway is Bedrock-shaped and exposes no OpenAI-compatible
  routes (`/v1/chat/completions`, `/v1/messages`, `/v1/models` all 404).
- **Staging only.** `developer-stg.api.autodesk.com` is hardcoded throughout the
  codebase. Production would be `developer.api.autodesk.com`, but that is untested and
  may expose a different model set. Note `APS_ENVIRONMENT` in `.env` is read but never
  actually applied to the base URL.
- **Streaming** (`/v1/invoke-stream`) is referenced by the code but wrapped in fallbacks
  and unverified. Prefer `/v1/invoke`.
- Never hardcode `APS_CLIENT_ID` / `APS_CLIENT_SECRET` in scripts — use environment
  variables.
