# TrustGuard Node.js SDK

[![npm](https://img.shields.io/npm/v/%40neuraltrust%2Ftrustguard-sdk)](https://www.npmjs.com/package/@neuraltrust/trustguard-sdk)
[Documentation](https://docs.neuraltrust.ai/sdks/trustguard/node) · [Python package](https://pypi.org/project/trustguard-sdk/) · [Go module](https://pkg.go.dev/github.com/NeuralTrust/trustguard-sdk/go) · [GitHub](https://github.com/NeuralTrust/trustguard-sdk)

Official Node.js / TypeScript client for the TrustGuard runtime evaluate API (`POST /v1/evaluate`). Configure a base URL and an API key, send the payload you want evaluated, and act on the verdict: TrustGuard detects, you enforce.

## Install

```bash
npm install @neuraltrust/trustguard-sdk
```

Requires Node.js 18+ (uses the built-in `fetch`). Zero runtime dependencies; ships ESM and CJS with full type definitions.

## Usage

```typescript
import { TrustGuard } from "@neuraltrust/trustguard-sdk";

const client = new TrustGuard({
  baseUrl: "https://guard.neuraltrust.ai",
  apiKey: process.env.TRUSTGUARD_API_KEY!,
});

const response = await client.guard({ payload: { input: "user text to evaluate" } });
if (response.isBlocked) {
  // block the request
}
```

### Options

```typescript
const response = await client.guard({
  payload: { input: "user text" },
  direction: "output",                // "input" (default) or "output"
  protocol: "llm",                    // "all" (default), "llm", "mcp", or "a2a"
  sessionId: "conversation-42",       // groups multi-turn traffic
  consumerId: "user-7",               // the end user behind the request
  attributes: { content_type: "text/plain" }, // routing hints
});
```

### Attachments

Documents are base64-encoded into `payload.attachments` for file-aware plugins (or pass a `url` for the server to fetch):

```typescript
const response = await client.guard({
  payload: { input: "summarize this file" },
  attachments: [{ filename: "doc.pdf", contentType: "application/pdf", data: pdfBytes }],
});
```

### Response

| Field | Meaning |
|---|---|
| `status` | Most restrictive verdict: `allow`, `block`, `transform`, `report`, or `""` when omitted. `isBlocked` is `true` when it is `block` |
| `findings` | Nested findings: `source` / `signal` / `outcome` / `evidence` (observational runs omit `signal`/`outcome`) |
| `transformedPayload` | The payload as rewritten by in-flight masking, `null` when untouched |
| `traceId` / `requestId` | Correlation ids for TrustGuard telemetry |

### Errors

Non-2xx responses throw `TrustGuardAPIError` with `status`, `traceId` and `requestId`. Transport failures (timeouts, connection errors) throw the underlying `fetch` errors. The default timeout is 10 seconds (`timeoutMs` to change it); pass `fetch` to supply a custom implementation.

```typescript
import { TrustGuardAPIError } from "@neuraltrust/trustguard-sdk";

try {
  await client.guard({ payload: { input: "..." } });
} catch (err) {
  if (err instanceof TrustGuardAPIError && err.status === 401) {
    // bad API key
  }
}
```

## Vercel AI SDK

`@neuraltrust/trustguard-sdk/ai-sdk` guards an [AI SDK](https://ai-sdk.dev) agent end to end: the prompt, the response, every tool call and every tool result. It needs `ai` 7 or later, which stays an optional peer dependency: the main entry point never loads it.

```typescript
import { streamText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { TrustGuard } from "@neuraltrust/trustguard-sdk";
import { trustguard } from "@neuraltrust/trustguard-sdk/ai-sdk";

const client = new TrustGuard({ baseUrl: process.env.TRUSTGUARD_URL!, apiKey: process.env.TRUSTGUARD_API_KEY! });

// One instance per request, so every evaluation carries the user and the conversation.
const tg = trustguard(client, { consumerId: user.id, sessionId: chatId });

const result = streamText({
  model: wrapLanguageModel({ model: openai("gpt-5.2"), middleware: tg.middleware }),
  tools: tg.tools(tools),
  toolApproval: tg.toolApproval,
  messages,
});
```

| Piece | Guards | Block | Transform | Ask |
|---|---|---|---|---|
| `middleware` | The user turn, before the model call | Throws `TrustGuardBlockedError` | Sends the masked text | Blocks, or passes with `promptAsk: "allow"` |
| `middleware` | The response | Replaces it with `blockedMessage` | Replaces it with the masked text | Not evaluated on output |
| `toolApproval` | Each tool call, before it runs | Denied, with the policy as the reason | Denied: approval cannot rewrite the arguments | `user-approval`, or denied with `toolAsk: "deny"` |
| `tools()` | Each tool result, before the model reads it | The tool fails with `TrustGuardBlockedError`, which the model sees as a tool error | Returns the masked result | Not evaluated on output |

Steps that continue a tool loop are not evaluated as prompts again: the tool results in them are covered by `tools()`. Wrap MCP tools the same way: `tg.tools(await mcpClient.tools())`.

**Streaming.** By default a streamed response is monitored: text streams untouched and is evaluated when the response finishes, so findings reach **Activity** but nothing is enforced. `stream: "buffer"` holds each text block until it ends, evaluates it, then releases it, masked or replaced. That enforces the policy and gives up streaming.

**Failures.** With the default `failMode: "closed"`, an evaluation error throws on the prompt and the response, and denies the tool call. `failMode: "open"` lets the traffic through. `onError` sees every error either way, and `onVerdict` every verdict.

**Not evaluated.** The system prompt, which your code writes. Files in the user turn, such as images and PDFs: only their text parts are sent. Reasoning parts of the response, which pass through unchanged.

**Composing approvals.** `toolApproval` returns `undefined` when TrustGuard lets a call through, so your own rules can follow it:

```typescript
toolApproval: async (options) => (await tg.toolApproval(options)) ?? myApproval(options),
```

## Documentation

The full guide is at [docs.neuraltrust.ai](https://docs.neuraltrust.ai/sdks/trustguard/node): setting up the collector
and its key, guarding input and output, configuration, the attributes
an evaluation carries, and troubleshooting. The [Evaluate API](https://docs.neuraltrust.ai/trustguard/api/evaluate)
is the contract every SDK wraps, and [SDKs](https://docs.neuraltrust.ai/sdks/overview) says when to reach
for TrustGuard and when for TrustGate.

The same client in other languages: [Python](https://pypi.org/project/trustguard-sdk/), [Go](https://pkg.go.dev/github.com/NeuralTrust/trustguard-sdk/go). Source, examples and issues:
[github.com/NeuralTrust/trustguard-sdk](https://github.com/NeuralTrust/trustguard-sdk).

## Development

```bash
npm install
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # tsup (ESM + CJS + d.ts)
```
