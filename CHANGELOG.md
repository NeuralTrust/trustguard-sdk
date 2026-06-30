# Changelog

All notable changes to the TrustGuard SDKs are documented here, per package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and each package versions independently (see [Releasing](README.md#releasing)).

> **Unreleased — wire contract update.** The `POST /v1/guard` request and response shapes changed and the SDKs were updated to match (pre-1.0, so no deprecation cycle):
> - Request: `input` → `payload`; `metadata` → `attributes` (where `content_type` lives); attachments now fold into `payload.attachments` (was `metadata.attachments`); new `protocol`, `collector_key`, and `gateway_id` fields. The server rejects unknown top-level keys, so the old `input`/`metadata` keys no longer work.
> - Response: `is_flagged` (bool) → `status` (string: `block`/`transform`/`report`/empty), with a convenience `isBlocked` / `is_blocked` / `IsBlocked()`; findings gained `status`, `policy_id`, `detector_id`, and `action`.
> - Attachments accept a `url` as an alternative to inline `data`.

## Node (`@neuraltrust/trustguard-sdk`)

### 0.1.0 — Unreleased

- Initial release: `TrustGuard` client for `POST /v1/guard` with typed request/response models, attachment encoding, and `TrustGuardAPIError`.
- Aligned with the updated guard contract: `payload`/`attributes`/`protocol`/`collectorKey`/`gatewayId` request fields, `payload.attachments` (with optional `url`), and a `status`/`isBlocked` response with enriched findings.

## Python (`neuraltrust-trustguard`)

### 0.1.0 — Unreleased

- Initial release: `TrustGuard` (sync) and `AsyncTrustGuard` clients for `POST /v1/guard` with dataclass models, attachment encoding, and `TrustGuardAPIError`.
- Aligned with the updated guard contract: `payload`/`attributes`/`protocol`/`collector_key`/`gateway_id` arguments, `payload.attachments` (with optional `url`), and a `status`/`is_blocked` response with enriched findings.

## Go (`github.com/NeuralTrust/trustguard-sdk/go`)

### go/v0.1.0 — Unreleased

- Initial release: `trustguard.Client` for `POST /v1/guard` with typed request/response models, attachment encoding, and `*APIError`.
- Aligned with the updated guard contract: `Payload`/`Attributes`/`Protocol`/`CollectorKey`/`GatewayID` request fields, `payload.attachments` (with optional `URL`), and a `Status`/`IsBlocked()` response with enriched findings.
