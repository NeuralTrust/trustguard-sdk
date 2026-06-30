import { TrustGuardAPIError } from "./errors.js";
import type { Attachment, Finding, GuardRequest, GuardResponse, TrustGuardOptions } from "./types.js";

const GUARD_PATH = "/v1/guard";
const DEFAULT_TIMEOUT_MS = 10_000;

interface WireFinding {
  detection_type?: string;
  confidence?: number;
  rule_name?: string;
  status?: string;
  policy_id?: string;
  detector_id?: string;
  action?: string;
  details?: unknown;
}

interface WireResponse {
  status?: string;
  transformed_payload?: Record<string, unknown> | null;
  findings?: WireFinding[];
  trace_id?: string;
  request_id?: string;
}

/** Client for the TrustGuard runtime guard API. */
export class TrustGuard {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: TrustGuardOptions) {
    const baseUrl = options.baseUrl?.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("TrustGuard: baseUrl is required");
    }
    if (!options.apiKey?.trim()) {
      throw new Error("TrustGuard: apiKey is required");
    }
    this.#baseUrl = baseUrl;
    this.#apiKey = options.apiKey;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  /**
   * Evaluates the request against the policy attached to the API key and
   * returns the verdict. Throws TrustGuardAPIError on non-2xx responses.
   */
  async guard(request: GuardRequest): Promise<GuardResponse> {
    if (!request.payload) {
      throw new Error("TrustGuard: request payload is required");
    }

    const response = await this.#fetch(this.#baseUrl + GUARD_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serializeRequest(request)),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });

    const text = await response.text();
    if (!response.ok) {
      throw apiError(response.status, text);
    }

    return deserializeResponse(parseJson(text) ?? {});
  }
}

/** Maps the camelCase request onto the snake_case wire format, omitting empty optionals (the server rejects unknown top-level fields). */
function serializeRequest(request: GuardRequest): Record<string, unknown> {
  let payload = request.payload;
  if (request.attachments?.length) {
    payload = { ...payload, attachments: request.attachments.map(serializeAttachment) };
  }
  const body: Record<string, unknown> = { payload };
  if (request.direction) body.direction = request.direction;
  if (request.protocol) body.protocol = request.protocol;
  if (request.collectorKey) body.collector_key = request.collectorKey;
  if (request.gatewayId) body.gateway_id = request.gatewayId;
  if (request.sessionId) body.session_id = request.sessionId;
  if (request.consumerId) body.consumer_id = request.consumerId;
  if (request.attributes && Object.keys(request.attributes).length > 0) body.attributes = request.attributes;
  return body;
}

function serializeAttachment(attachment: Attachment): Record<string, string> {
  const entry: Record<string, string> = {
    filename: attachment.filename,
    content_type: attachment.contentType,
  };
  if (attachment.data !== undefined) {
    const bytes =
      typeof attachment.data === "string" ? Buffer.from(attachment.data, "utf-8") : Buffer.from(attachment.data);
    entry.data = bytes.toString("base64");
  }
  if (attachment.url !== undefined) entry.url = attachment.url;
  return entry;
}

function deserializeResponse(wire: WireResponse): GuardResponse {
  const status = wire.status ?? "";
  return {
    status,
    isBlocked: status === "block",
    transformedPayload: wire.transformed_payload ?? null,
    findings: (wire.findings ?? []).map(
      (f): Finding => ({
        detectionType: f.detection_type,
        confidence: f.confidence,
        ruleName: f.rule_name,
        status: f.status,
        policyId: f.policy_id,
        detectorId: f.detector_id,
        action: f.action,
        details: f.details,
      }),
    ),
    traceId: wire.trace_id ?? "",
    requestId: wire.request_id ?? "",
  };
}

function apiError(status: number, text: string): TrustGuardAPIError {
  const payload = parseJson(text) as { error?: string; trace_id?: string; request_id?: string } | undefined;
  const message = payload?.error || text.trim() || `HTTP ${status}`;
  return new TrustGuardAPIError(status, message, payload?.trace_id ?? "", payload?.request_id ?? "");
}

function parseJson(text: string): WireResponse | undefined {
  try {
    return JSON.parse(text) as WireResponse;
  } catch {
    return undefined;
  }
}
