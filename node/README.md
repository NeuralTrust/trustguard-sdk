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

const response = await client.guard({ input: { prompt: "user text to evaluate" } });
if (response.isFlagged) {
  // block the request
}
```

### Options

```typescript
const response = await client.guard({
  input: { prompt: "user text" },
  direction: "output",                // "input" (default) or "output"
  sessionId: "conversation-42",       // groups multi-turn traffic
  consumerId: "user-7",               // the end user behind the request
});
```

### Attachments

Documents are base64-encoded into `metadata.attachments` for file-aware plugins:

```typescript
const response = await client.guard({
  input: { prompt: "summarize this file" },
  attachments: [{ filename: "doc.pdf", contentType: "application/pdf", data: pdfBytes }],
});
```

### Response

| Field | Meaning |
|---|---|
| `isFlagged` | The enforcement signal: block when `true` |
| `findings` | What every plugin in the policy chain reported (`detectionType`, `confidence`, `ruleName`, `details`) |
| `transformedPayload` | The payload as rewritten by in-flight masking, `null` when untouched |
| `traceId` / `requestId` | Correlation ids for TrustGuard telemetry |

### Errors

Non-2xx responses throw `TrustGuardAPIError` with `status`, `traceId` and `requestId`. Transport failures (timeouts, connection errors) throw the underlying `fetch` errors. The default timeout is 10 seconds (`timeoutMs` to change it); pass `fetch` to supply a custom implementation.

```typescript
import { TrustGuardAPIError } from "@neuraltrust/trustguard-sdk";

try {
  await client.guard({ input: { prompt: "..." } });
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
