/** Traffic side being evaluated; rules are scoped per side. Defaults to "input" server-side. */
export type Direction = "input" | "output";

/** Traffic protocol the policy rules are scoped to. Defaults to "all" server-side. */
export type Protocol = "all" | "llm" | "mcp" | "a2a";

/** A document evaluated alongside the payload by file-aware plugins. */
export interface Attachment {
  filename: string;
  contentType: string;
  /** Raw file content; strings are encoded as UTF-8, then base64 on the wire. Provide `data` or `url`. */
  data?: Uint8Array | string;
  /** URL for the server to fetch instead of inlining `data`. */
  url?: string;
}

/** Payload for a guard evaluation. */
export interface GuardRequest {
  /** The content to evaluate, e.g. `{ input: "..." }` or provider-shaped fields. Required. */
  payload: Record<string, unknown>;
  /** Traffic side; the server defaults to "input" when omitted. */
  direction?: Direction;
  /** Traffic protocol; the server defaults to "all" when omitted. */
  protocol?: Protocol;
  /** Groups multi-turn traffic; the server synthesises one when omitted. */
  sessionId?: string;
  /** Identifies the end user on whose behalf the request runs. */
  consumerId?: string;
  /** Optional routing hints. Server-side key: `content_type` (overrides the payload content type). */
  attributes?: Record<string, unknown>;
  /** Documents to evaluate; folded into `payload.attachments` on the wire. */
  attachments?: Attachment[];
}

/** A single plugin's contribution to the guard response. */
export interface Finding {
  detectionType?: string;
  confidence?: number;
  ruleName?: string;
  /** The action the matched rule applied: "block", "transform", or "report". */
  status?: string;
  policyId?: string;
  detectorId?: string;
  /** The configured rule action behind this finding. */
  action?: string;
  details?: unknown;
}

/**
 * Verdict returned by POST /v1/guard. TrustGuard detects; the caller enforces:
 * block when `status` is "block" (`isBlocked` is the convenience signal).
 */
export interface GuardResponse {
  /** Most restrictive verdict: "block", "transform", "report", or "" when clean. */
  status: string;
  /** Convenience flag: true when `status === "block"`. */
  isBlocked: boolean;
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
  /** Base URL of the TrustGuard deployment, e.g. https://guard.neuraltrust.ai */
  baseUrl: string;
  /** Collector API key, sent as a Bearer token. */
  apiKey: string;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Custom fetch implementation (proxies, test doubles). Default globalThis.fetch. */
  fetch?: typeof fetch;
}
