# TrustGuard Node.js SDK

Official Node.js / TypeScript client for the TrustGuard runtime guard API (`POST /v1/guard`). Configure a base URL and an API key, send the payload you want evaluated, and act on the verdict: TrustGuard detects, you enforce.

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
| `status` | Most restrictive verdict: `block`, `transform`, `report`, or `""` when clean. `isBlocked` is `true` when it is `block` |
| `findings` | What every plugin in the policy chain reported (`detectionType`, `confidence`, `ruleName`, `status`, `policyId`, `detectorId`, `action`, `details`) |
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

## Development

```bash
npm install
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # tsup (ESM + CJS + d.ts)
```
