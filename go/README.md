# TrustGuard Go SDK

Official Go client for the TrustGuard runtime guard API (`POST /v1/guard`). Configure a base URL and an API key, send the payload you want evaluated, and act on the verdict: TrustGuard detects, you enforce.

## Install

```bash
go get github.com/NeuralTrust/trustguard-sdk/go
```

Stdlib only — no third-party dependencies.

## Usage

```go
package main

import (
	"context"
	"log"
	"os"

	trustguard "github.com/NeuralTrust/trustguard-sdk/go"
)

func main() {
	client, err := trustguard.New("https://guard.neuraltrust.ai", os.Getenv("TRUSTGUARD_API_KEY"))
	if err != nil {
		log.Fatal(err)
	}

	resp, err := client.Guard(context.Background(), trustguard.GuardRequest{
		Payload: map[string]any{"input": "user text to evaluate"},
	})
	if err != nil {
		log.Fatal(err)
	}
	if resp.IsBlocked() {
		// block the request
	}
}
```

### Options

```go
resp, err := client.Guard(ctx, trustguard.GuardRequest{
	Payload:    map[string]any{"input": "user text"},
	Direction:  trustguard.DirectionOutput, // input (default) or output
	Protocol:   trustguard.ProtocolLLM,     // all (default), llm, mcp, or a2a
	SessionID:  "conversation-42",          // groups multi-turn traffic
	ConsumerID: "user-7",                   // the end user behind the request
	Attributes: map[string]any{"content_type": "text/plain"}, // routing hints
})
```

Client options: `trustguard.WithTimeout(5*time.Second)` (default 10s) and `trustguard.WithHTTPClient(custom)` for proxies or test doubles.

### Attachments

Documents are base64-encoded into `payload.attachments` for file-aware plugins (or pass a `URL` for the server to fetch):

```go
req := trustguard.GuardRequest{Payload: map[string]any{"input": "summarize this file"}}
req.AddAttachment(trustguard.Attachment{
	Filename:    "doc.pdf",
	ContentType: "application/pdf",
	Data:        pdfBytes,
})
```

### Response

| Field | Meaning |
|---|---|
| `Status` | Most restrictive verdict: `block`, `transform`, `report`, or empty when clean. `IsBlocked()` returns true when it is `block` |
| `Findings` | What every plugin in the policy chain reported (`DetectionType`, `Confidence`, `RuleName`, `Status`, `PolicyID`, `DetectorID`, `Action`, `Details`) |
| `TransformedPayload` | The payload as rewritten by in-flight masking, `nil` when untouched |
| `TraceID` / `RequestID` | Correlation ids for TrustGuard telemetry |

### Errors

Non-2xx responses return a `*trustguard.APIError` with `StatusCode`, `Message`, `TraceID` and `RequestID`:

```go
resp, err := client.Guard(ctx, req)
var apiErr *trustguard.APIError
if errors.As(err, &apiErr) && apiErr.StatusCode == 401 {
	// bad API key
}
```

Transport failures (timeouts, connection errors) are returned as regular wrapped errors.

## Development

```bash
go vet ./...
go test ./...
```

## Releasing

Go modules are consumed straight from git: tag `go/vX.Y.Z` (the `go/` prefix is the convention for a module living in the `go/` subdirectory of the repo).
