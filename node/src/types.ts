/** Traffic side being evaluated; rules are scoped per side. Defaults to "input" server-side. */
export type Direction = "input" | "output";

/** A document evaluated alongside the payload by file-aware plugins. */
export interface Attachment {
  filename: string;
  contentType: string;
  /** Raw file content; strings are encoded as UTF-8. Base64 encoding happens on the wire. */
  data: Uint8Array | string;
}

/** Payload for a guard evaluation. */
export interface GuardRequest {
  /** The payload to evaluate. Required. */
  input: Record<string, unknown>;
  /** Traffic side; the server defaults to "input" when omitted. */
  direction?: Direction;
  /** Groups multi-turn traffic; the server synthesises one when omitted. */
  sessionId?: string;
  /** Identifies the end user on whose behalf the request runs. */
  consumerId?: string;
  /**
   * Optional routing hints. Server-side keys: `policy_id` (selects the policy
   * when the API key allows more than one) and `content_type` (overrides the
   * payload content type, default application/json).
   */
  metadata?: Record<string, unknown>;
  /** Documents to evaluate; folded into `metadata.attachments` on the wire. */
  attachments?: Attachment[];
}

/** A single plugin's contribution to the guard response. */
export interface Finding {
  detectionType?: string;
  confidence?: number;
  ruleName?: string;
  details?: unknown;
}

/**
 * Verdict returned by POST /v1/guard. TrustGuard detects; the caller enforces:
 * block when `isFlagged` is true.
 */
export interface GuardResponse {
  /** The enforcement signal: true when the policy flagged the payload. */
  isFlagged: boolean;
  /** The payload as rewritten by in-flight masking, null when untouched. */
  transformedPayload: Record<string, unknown> | null;
  /** What every plugin in the policy chain reported. */
  findings: Finding[];
  /** Correlation ids for TrustGuard telemetry. */
  traceId: string;
  requestId: string;
}

/** Configuration for the TrustGuard client. */
export interface TrustGuardOptions {
  /** Base URL of the TrustGuard deployment, e.g. https://guard.example.com */
  baseUrl: string;
  /** Collector API key, sent as a Bearer token. */
  apiKey: string;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Custom fetch implementation (proxies, test doubles). Default globalThis.fetch. */
  fetch?: typeof fetch;
}
