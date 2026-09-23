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
