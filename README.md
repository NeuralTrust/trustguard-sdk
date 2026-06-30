# TrustGuard SDKs

[![CI](https://github.com/NeuralTrust/trustguard-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/NeuralTrust/trustguard-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40neuraltrust%2Ftrustguard-sdk)](https://www.npmjs.com/package/@neuraltrust/trustguard-sdk)
[![PyPI](https://img.shields.io/pypi/v/neuraltrust-trustguard)](https://pypi.org/project/neuraltrust-trustguard/)
[![Go Reference](https://pkg.go.dev/badge/github.com/NeuralTrust/trustguard-sdk/go.svg)](https://pkg.go.dev/github.com/NeuralTrust/trustguard-sdk/go)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Official client SDKs for the [TrustGuard](https://neuraltrust.ai) runtime guard API (`POST /v1/guard`).

Each SDK is a thin, typed client around a single endpoint: you configure a **base URL** and an **API key**, send the payload you want evaluated, and get back the verdict. TrustGuard detects — prompt injection, jailbreaks, PII, toxicity, and whatever else the collector's policy runs — and **your code enforces**: block when `status` is `block`.

| Language | Package | Install | Docs |
|---|---|---|---|
| Node.js / TypeScript | `@neuraltrust/trustguard-sdk` | `npm install @neuraltrust/trustguard-sdk` | [`node/`](node/) |
| Python (sync + async) | `neuraltrust-trustguard` | `pip install neuraltrust-trustguard` | [`python/`](python/) |
| Go | `github.com/NeuralTrust/trustguard-sdk/go` | `go get github.com/NeuralTrust/trustguard-sdk/go` | [`go/`](go/) |

## How it works

```mermaid
sequenceDiagram
    participant App as Your application
    participant SDK as TrustGuard SDK
    participant TG as TrustGuard /v1/guard

    App->>SDK: guard({ payload, collector_key, ... })
    SDK->>TG: POST /v1/guard (Bearer API key)
    TG->>TG: Run the collector's policy plugin chain
    TG-->>SDK: status, findings, transformed_payload
    SDK-->>App: Typed GuardResponse
    App->>App: Block, allow, or forward the masked payload
```

## Quick start

**Node.js**

```typescript
import { TrustGuard } from "@neuraltrust/trustguard-sdk";

const client = new TrustGuard({ baseUrl: "https://guard.neuraltrust.ai", apiKey: process.env.TRUSTGUARD_API_KEY! });
const res = await client.guard({ payload: { input: "user text" } });
if (res.isBlocked) {
  // block the request
}
```

**Python**

```python
from trustguard import TrustGuard

with TrustGuard("https://guard.neuraltrust.ai", api_key="...") as client:
    res = client.guard({"input": "user text"})
    if res.is_blocked:
        ...  # block the request
```

**Go**

```go
client, _ := trustguard.New("https://guard.neuraltrust.ai", os.Getenv("TRUSTGUARD_API_KEY"))
res, err := client.Guard(ctx, trustguard.GuardRequest{Payload: map[string]any{"input": "user text"}})
if err == nil && res.IsBlocked() {
    // block the request
}
```

Runnable versions of these — plus async Python, attachments, and error handling — live in [`examples/`](examples/).

## What you can send

The `payload` is the content to evaluate (e.g. `{ input: "..." }` or provider-shaped fields like `messages`/`tools`). Beyond it, every SDK supports the same optional context:

| Option | Purpose |
|---|---|
| `collector_key` / `gateway_id` | Addresses the collector to evaluate against (with a service token; omit when the API key is bound to a collector) |
| `direction` | `input` (default) evaluates what goes *into* the model, `output` what comes back |
| `protocol` | `all` (default), `llm`, `mcp`, or `a2a` — scopes which rules run |
| `session_id` | Groups multi-turn conversations for session-aware detections |
| `consumer_id` | Identifies the end user behind the request |
| `attributes` | Routing hints, e.g. `content_type` to override the payload content type |
| attachments | Documents (base64-encoded into `payload.attachments`, or a `url`) for file-aware plugins |

And every response carries `status` (`block`/`transform`/`report`/empty), the full `findings` list (each with its own `status`, `policy_id`, `detector_id`, `action`), the `transformed_payload` when a masking plugin rewrote content, and `trace_id`/`request_id` for support and telemetry.

## Releasing

Releases are tag-driven, one tag namespace per language; each package versions independently:

| Language | Tag | Effect |
|---|---|---|
| Node | `node-vX.Y.Z` | CI publishes to npm (requires `NPM_TOKEN` secret) |
| Python | `python-vX.Y.Z` | CI builds and publishes to PyPI (trusted publishing) |
| Go | `go/vX.Y.Z` | Nothing to publish — Go consumers fetch the module from git; the `go/` prefix is the standard convention for a module living in the `go/` subdirectory |

Bump the version in the package manifest (`node/package.json` / `python/pyproject.toml`) before tagging, and update [`CHANGELOG.md`](CHANGELOG.md). Go has no manifest version; the tag is the version.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, testing requirements, and the API-contract rules that keep the three SDKs consistent. Security issues go through [SECURITY.md](SECURITY.md), never public issues.

- `node/`: `npm install && npm run lint && npm test && npm run build`
- `python/`: `pip install -e '.[dev]' && ruff check . && pytest`
- `go/`: `go vet ./... && go test ./...`

## License

[MIT](LICENSE) © NeuralTrust
