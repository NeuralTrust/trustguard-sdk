# Changelog

All notable changes to the TrustGuard SDKs are documented here, per package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and each package versions independently (see [Releasing](README.md#releasing)).

> **Unreleased — evaluate endpoint + nested findings.** Pre-1.0; no deprecation cycle.
> - Endpoint: `POST /v1/guard` → `POST /v1/evaluate` (legacy `/v1/guard` is gone on current TrustGuard).
> - Findings: flat `detection_type` / `policy_id` / `details` → nested `source` / `signal` / `outcome` / `evidence` (matches TrustGuard findings contract).
> - Response `status` includes `allow` in addition to `block` / `transform` / `report`.

## Node (`@neuraltrust/trustguard-sdk`)

### Unreleased

- Add `examples/ai-sdk`, a Next.js chat agent guarded end to end, with signed tool approvals and a live verdict panel.

### 0.1.5 — 2026-09-23

- Add `@neuraltrust/trustguard-sdk/ai-sdk`, which guards a Vercel AI SDK agent: a language model middleware for the prompt and the response, a `toolApproval` function for tool calls, and a tool set wrapper for tool results. `ai` 7 is an optional peer dependency; the main entry point does not load it.
- Encode attachments without `Buffer`, so the client runs on edge runtimes.

### 0.1.3 — 2026-07-24

- Publish `POST /v1/evaluate` client with nested findings (`source` / `signal` / `outcome` / `evidence`) and `status` / `isBlocked` response.

### 0.1.0 — Unreleased

- Initial release notes retained for historical context.

## Python (`trustguard-sdk`)

### 0.1.3 — Unreleased

- Rename PyPI distribution from `neuraltrust-trustguard` to `trustguard-sdk` (import path remains `trustguard`).

### 0.1.2 — 2026-07-24

- Publish `POST /v1/evaluate` client with nested findings (`FindingSource` / `FindingSignal` / `FindingOutcome` / `evidence`) and `status` / `is_blocked` response.

### 0.1.0 — Unreleased

- Initial release notes kept for Node/Go packages still unreleased under their own tags.

## Go (`github.com/NeuralTrust/trustguard-sdk/go`)

### go/v0.1.0 — Unreleased

- Initial release: `trustguard.Client` for `POST /v1/evaluate` with typed request/response models, attachment encoding, and `*APIError`.
- Nested findings (`FindingSource` / `FindingSignal` / `FindingOutcome` / `Evidence`) and `Status` / `IsBlocked()` response.
