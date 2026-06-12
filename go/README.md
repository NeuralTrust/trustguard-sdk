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
	client, err := trustguard.New("https://guard.example.com", os.Getenv("TRUSTGUARD_API_KEY"))
	if err != nil {
		log.Fatal(err)
	}

	resp, err := client.Guard(context.Background(), trustguard.GuardRequest{
		Input: map[string]any{"prompt": "user text to evaluate"},
	})
	if err != nil {
		log.Fatal(err)
	}
	if resp.IsFlagged {
		// block the request
	}
}
```

### Options

```go
resp, err := client.Guard(ctx, trustguard.GuardRequest{
	Input:      map[string]any{"prompt": "user text"},
	Direction:  trustguard.DirectionOutput, // input (default) or output
	SessionID:  "conversation-42",          // groups multi-turn traffic
	ConsumerID: "user-7",                   // the end user behind the request
	Metadata: map[string]any{
		trustguard.MetadataPolicyID: "...", // required when the API key allows several policies
	},
})
```

Client options: `trustguard.WithTimeout(5*time.Second)` (default 10s) and `trustguard.WithHTTPClient(custom)` for proxies or test doubles.

### Attachments

Documents are base64-encoded into `metadata.attachments` for file-aware plugins:

```go
req := trustguard.GuardRequest{Input: map[string]any{"prompt": "summarize this file"}}
req.AddAttachment(trustguard.Attachment{
	Filename:    "doc.pdf",
	ContentType: "application/pdf",
	Data:        pdfBytes,
})
```

### Response

| Field | Meaning |
|---|---|
| `IsFlagged` | The enforcement signal: block when `true` |
| `Findings` | What every plugin in the policy chain reported (`DetectionType`, `Confidence`, `RuleName`, `Details`) |
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
