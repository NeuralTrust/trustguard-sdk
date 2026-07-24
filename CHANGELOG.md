# Changelog

All notable changes to the TrustGuard SDKs are documented here, per package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and each package versions independently (see [Releasing](README.md#releasing)).

> **Unreleased — evaluate endpoint + nested findings.** Pre-1.0; no deprecation cycle.
> - Endpoint: `POST /v1/guard` → `POST /v1/evaluate` (legacy `/v1/guard` is gone on current TrustGuard).
> - Findings: flat `detection_type` / `policy_id` / `details` → nested `source` / `signal` / `outcome` / `evidence` (matches TrustGuard findings contract).
> - Response `status` includes `allow` in addition to `block` / `transform` / `report`.

## Node (`@neuraltrust/trustguard-sdk`)

### 0.1.0 — Unreleased

- Initial release: `TrustGuard` client for `POST /v1/evaluate` with typed request/response models, attachment encoding, and `TrustGuardAPIError`.
- Nested findings (`source` / `signal` / `outcome` / `evidence`) and `status` / `isBlocked` response.

## Python (`neuraltrust-trustguard`)

### 0.1.2 — 2026-07-24

- Publish `POST /v1/evaluate` client with nested findings (`FindingSource` / `FindingSignal` / `FindingOutcome` / `evidence`) and `status` / `is_blocked` response.

### 0.1.0 — Unreleased

- Initial release notes kept for Node/Go packages still unreleased under their own tags.

## Go (`github.com/NeuralTrust/trustguard-sdk/go`)

### go/v0.1.0 — Unreleased

- Initial release: `trustguard.Client` for `POST /v1/evaluate` with typed request/response models, attachment encoding, and `*APIError`.
- Nested findings (`FindingSource` / `FindingSignal` / `FindingOutcome` / `Evidence`) and `Status` / `IsBlocked()` response.
