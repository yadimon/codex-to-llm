# @yadimon/codex-to-llm-server

Expose your local Codex sign-in through a small, Responses-compatible HTTP server.

Use it when an existing local application already expects `POST /v1/responses`, when several processes need one model endpoint, or when the Codex boundary belongs in a Docker sidecar instead of application code.

> Community package; not an official OpenAI server. It implements a documented subset of the Responses API, not the complete OpenAI API.

## Install and start

```bash
npm install -g @yadimon/codex-to-llm-server
codex-to-llm-server
```

Or run without a global install:

```bash
npx @yadimon/codex-to-llm-server
```

The default server listens on `http://127.0.0.1:3000` and uses the `codex-exec` backend. It requires:

- Node.js `>=20`
- the `codex` CLI in `PATH` (or `CODEX_TO_LLM_CLI_PATH`)
- valid Codex auth at `~/.codex/auth.json` (or `CODEX_TO_LLM_AUTH_PATH`)

## Quick start

Check readiness and the model allowlist:

```bash
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/v1/models
```

Send a response request:

```bash
curl http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex-spark",
    "input": "Explain closures in two sentences."
  }'
```

The text is available as both `output_text` and an `output[].content[]` block in the returned response object.

### Use the OpenAI JavaScript client

```bash
npm install openai
```

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:3000/v1",
  apiKey: process.env.CODEX_TO_LLM_SERVER_API_KEY || "local-dev"
});

const response = await client.responses.create({
  model: "gpt-5.3-codex-spark",
  input: "Return only the word OK."
});

console.log(response.output_text);
```

The placeholder key is accepted only when the local server has no API key configured. If `CODEX_TO_LLM_SERVER_API_KEY` is set, pass the same value to the client.

### Stream with SSE

```bash
curl -N http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex-spark",
    "stream": true,
    "input": "Count from 1 to 3."
  }'
```

The stream emits `response.created`, `response.output_text.delta`, `response.output_text.done`, and `response.completed`, followed by `data: [DONE]`. A keepalive comment is sent after 15 seconds without output, and client disconnects abort the upstream runner.

With the default backend, a delta represents a Codex `agent_message`, not necessarily one token. Short answers can arrive as one large delta.

## Choose a backend

| | `codex-exec` (default) | `codex-oauth` (experimental) |
|---|---|---|
| Calls | installed `codex exec` process | ChatGPT/Codex Responses backend directly |
| Best for | conservative local text and image automation | trusted local calls that need lower process overhead or exact Responses-shaped input |
| Input handling | flattens dialog into a text prompt | preserves Responses-shaped messages and content blocks |
| Images | HTTPS and base64 data-image URLs, materialized for `codex exec --image` | HTTPS and base64 data-image URLs forwarded as Responses content |
| `instructions` | optional | required |
| `max_output_tokens` | forwarded to core | validated locally, then omitted upstream |
| Risk confirmation | not required | `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1` required |
| Public bind | possible; bearer auth strongly recommended | requires bearer auth outside loopback |

### Experimental direct mode

PowerShell:

```powershell
$env:CODEX_TO_LLM_BACKEND = "codex-oauth"
$env:CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1"
npx @yadimon/codex-to-llm-server
```

macOS/Linux:

```bash
CODEX_TO_LLM_BACKEND=codex-oauth \
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 \
npx @yadimon/codex-to-llm-server
```

Equivalent CLI selection:

```bash
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 \
npx @yadimon/codex-to-llm-server --backend codex-oauth
```

Every direct request must include non-empty `instructions`:

```json
{
  "model": "gpt-5.3-codex-spark",
  "instructions": "Answer briefly and return plain text.",
  "input": "What is a closure?"
}
```

The backend uses the OAuth access token in Codex `auth.json`; it is not the public OpenAI API-key endpoint. It may change, reject fields, rate-limit, or stop working. There is no OAuth refresh in this package—refresh the local Codex login if upstream authentication starts failing.

Do not expose subscription-backed direct mode as a public proxy. Keep it on loopback, or use your own API key and network controls for a private container network. See OpenAI's [Services Agreement](https://openai.com/policies/services-agreement/) and [API authentication guidance](https://platform.openai.com/docs/api-reference/authentication).

### Image input

Images must be nested in a message content array. Top-level `input_image` is not supported.

```json
{
  "model": "gpt-5.3-codex-spark",
  "instructions": "Describe only what is visible.",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "What is in this image?" },
        {
          "type": "input_image",
          "image_url": "https://example.com/image.png",
          "detail": "low"
        }
      ]
    }
  ]
}
```

Supported image URLs are `https://...` and base64 `data:image/png|jpeg|gif|webp` URLs. `file_id` and HTTP URLs return `400` instead of being silently dropped.

The default `codex-exec` backend validates each image, downloads HTTPS inputs with private-network and redirect protections, writes package-owned temporary files, passes them through Codex CLI `--image`, and removes the files after the call. Its limits are 20 images, 10 MiB per image, and 20 MiB total. The optional `detail` field is validated for wire compatibility but Codex CLI chooses image fidelity; use `codex-oauth` only when exact Responses-shaped image blocks and `detail` forwarding are required.

Choose a model with image input support, for example `gpt-5.6-sol`. The default text-oriented model may not accept images.

## API compatibility

Endpoints:

| Endpoint | Behavior |
|---|---|
| `POST /v1/responses` | Synchronous JSON or SSE with `stream: true`. |
| `GET /v1/models` | Configured model allowlist. |
| `GET /healthz` | Process readiness only: `{ "ok": true }`. |

`/healthz` does not make an authenticated model call, so use a tiny response request for an end-to-end credential check.

Supported request fields:

- `model`
- `input` as a string, a message array, or `{ messages, input }`
- `instructions`
- `stream`
- `reasoning.effort`: `low`, `medium`, or `high`
- `max_output_tokens` (see backend difference above)

Explicitly unsupported fields return `400`:

- `tools`, `tool_choice`, and `parallel_tool_calls`
- `conversation` and `previous_response_id`
- top-level `input_audio` and `input_image`

There is no `/v1/chat/completions`, embeddings, files, batches, tool execution, conversation storage, or automatic retry layer. A Chat Completions-only router needs a separate translation gateway.

## Dialog semantics and trust boundary

In `codex-exec` mode, the server flattens message text into one prompt with `### system`, `### developer`, `### user`, and `### assistant` headers, while user image blocks are attached in encounter order through `codex exec --image`. It also adds a short stateless-adapter prelude. User content is not escaped, so untrusted text that mimics those headers remains visible to the model. Validate or delimit adversarial input in the caller.

In `codex-oauth` mode, message roles and text/image content blocks are forwarded in Responses shape, with `stream: true` and `store: false` forced upstream. No adapter prelude is added.

## Authentication and model allowlisting

Set a bearer token before making the server reachable beyond one trusted local process:

```bash
CODEX_TO_LLM_SERVER_API_KEY=change-me npx @yadimon/codex-to-llm-server
```

PowerShell:

```powershell
$env:CODEX_TO_LLM_SERVER_API_KEY = "change-me"
npx @yadimon/codex-to-llm-server
```

Then call with:

```text
Authorization: Bearer change-me
```

Only `POST /v1/responses` is protected. `/healthz` and `/v1/models` remain public and reveal readiness plus configured model IDs.

Configure the default and allowlist together:

```bash
CODEX_TO_LLM_SERVER_MODELS=gpt-5.3-codex-spark,gpt-5.4-mini \
CODEX_TO_LLM_SERVER_DEFAULT_MODEL=gpt-5.4-mini \
npx @yadimon/codex-to-llm-server
```

Requests for a model outside the list return `400`.

## Use as a library

```js
import { startServer } from "@yadimon/codex-to-llm-server";

const local = await startServer({
  host: "127.0.0.1",
  port: 0,
  models: ["gpt-5.3-codex-spark"],
  defaultModel: "gpt-5.3-codex-spark",
  apiKey: process.env.LOCAL_LLM_API_KEY
});

console.log(local.url);

// Later:
await local.close();
```

Port `0` asks the operating system for an available port.

## Runtime configuration

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_SERVER_HOST` | `127.0.0.1` | Bind host. |
| `CODEX_TO_LLM_SERVER_PORT` | `3000` | Bind port. |
| `CODEX_TO_LLM_SERVER_DEFAULT_MODEL` | `gpt-5.3-codex-spark` | Model used when the request omits `model`. |
| `CODEX_TO_LLM_SERVER_MODELS` | default model | Comma-separated model allowlist. |
| `CODEX_TO_LLM_SERVER_API_KEY` | - | Bearer token required by `POST /v1/responses`. |
| `CODEX_TO_LLM_SERVER_LOG` | on | Set to `off` to disable structured request logs. |
| `CODEX_TO_LLM_BACKEND` | `codex-exec` | `codex-exec` or `codex-oauth`. |
| `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK` | - | Must be `1` for `codex-oauth`. |
| `CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT` | ChatGPT/Codex backend | Direct-mode endpoint override for tests. |
| `CODEX_TO_LLM_CODEX_CLIENT_VERSION` | `0.144.1` | Direct-mode `Version` header. |
| `CODEX_TO_LLM_CODEX_USER_AGENT` | `codex-cli/0.144.1` | Direct-mode `User-Agent` header. |
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Codex executable for the default backend. |
| `CODEX_TO_LLM_REASONING_EFFORT` | core default | Default effort for `codex-exec`; a request field overrides it. |
| `CODEX_TO_LLM_SANDBOX` | `read-only` | Default `codex-exec` sandbox. |
| `CODEX_TO_LLM_WEB_SEARCH` | `disabled` | Default `codex-exec` search mode. |
| `CODEX_TO_LLM_IGNORE_RULES` | `false` | Pass `--ignore-rules` to `codex-exec`. |
| `CODEX_TO_LLM_IGNORE_USER_CONFIG` | `false` | Skip the generated hardened config in `codex-exec`. |
| `CODEX_TO_LLM_HOME_BASE` | platform data directory | Base for generated `codex-exec` homes. |
| `CODEX_TO_LLM_CONFIG_HOME` | generated per run | Explicit `codex-exec` home; not automatically deleted. |
| `CODEX_TO_LLM_WORKSPACE` | temporary directory | Explicit `codex-exec` workspace; not automatically deleted. |
| `CODEX_TO_LLM_SERVER_MOCK_MODE` | - | Enable the package's deterministic mock runner. |
| `CODEX_TO_LLM_SERVER_MOCK_RESPONSE` | `mock response` | Text returned by the mock runner. |

Run `npx @yadimon/codex-to-llm-server --help` for CLI flags.

## Structured logs

The server writes one JSON line per HTTP request, including request ID, route, status, latency, model, stream flag, prompt character count, and token usage when available. It does not put prompt or response text in the request record.

Treat debug output from the underlying Codex process separately; do not forward arbitrary upstream stdout/stderr into shared observability without checking it for sensitive content.

## Docker

The Dockerfile uses the monorepo as its build context:

```bash
docker build -f packages/codex-to-llm-server/Dockerfile -t codex-to-llm-server .
```

Example local run:

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v "$HOME/.codex/auth.json:/run/secrets/codex-auth.json:ro" \
  -e CODEX_TO_LLM_AUTH_PATH=/run/secrets/codex-auth.json \
  -e CODEX_TO_LLM_SERVER_API_KEY=change-me \
  codex-to-llm-server
```

For Docker Desktop on Windows, a named volume plus an explicit credential-copy step can be more reliable than a deeply nested bind mount. Whichever method you use, keep the auth file read-only inside the runtime container and out of the image layers.

## Troubleshooting

- **`401` from the local server:** `CODEX_TO_LLM_SERVER_API_KEY` is set and the request is missing the matching bearer token.
- **`Unsupported model`:** check `GET /v1/models`, then update `CODEX_TO_LLM_SERVER_MODELS` and ensure the default model is included.
- **`instructions are required in codex-oauth direct mode`:** add a non-empty top-level `instructions` string to the Responses request.
- **An image request fails:** place `input_image` inside a user message content array. Only HTTPS and supported base64 data-image URLs are accepted; the default backend also blocks private-network destinations and enforces image size/count limits.
- **`Codex direct upstream failed with HTTP 401` or `403`:** refresh the Codex login on the host and retry. This package does not refresh OAuth tokens.
- **A Chat Completions client gets `404`:** the package exposes `/v1/responses`, not `/v1/chat/completions`. Configure the client for Responses or place a deliberate translator in front of the server.
- **Health is green but generation fails:** `/healthz` checks only the HTTP process. Make a small authenticated `/v1/responses` request to verify credentials, model access, and the selected backend end to end.

## Development

```bash
npm run build --workspace @yadimon/codex-to-llm-server
npm run lint --workspace @yadimon/codex-to-llm-server
npm run typecheck --workspace @yadimon/codex-to-llm-server
npm test --workspace @yadimon/codex-to-llm-server
```
