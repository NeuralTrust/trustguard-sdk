import { TrustGuardAPIError } from "./errors.js";
import type { Attachment, Finding, GuardRequest, GuardResponse, TrustGuardOptions } from "./types.js";

const GUARD_PATH = "/v1/guard";
const DEFAULT_TIMEOUT_MS = 10_000;

interface WireFinding {
  detection_type?: string;
  confidence?: number;
  rule_name?: string;
  details?: unknown;
}

interface WireResponse {
  is_flagged?: boolean;
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
    if (!request.input) {
      throw new Error("TrustGuard: request input is required");
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
  const body: Record<string, unknown> = { input: request.input };
  if (request.direction) body.direction = request.direction;
  if (request.sessionId) body.session_id = request.sessionId;
  if (request.consumerId) body.consumer_id = request.consumerId;

  let metadata = request.metadata;
  if (request.attachments?.length) {
    metadata = { ...metadata, attachments: request.attachments.map(serializeAttachment) };
  }
  if (metadata && Object.keys(metadata).length > 0) body.metadata = metadata;
  return body;
}

function serializeAttachment(attachment: Attachment): Record<string, string> {
  const bytes =
    typeof attachment.data === "string" ? Buffer.from(attachment.data, "utf-8") : Buffer.from(attachment.data);
  return {
    filename: attachment.filename,
    content_type: attachment.contentType,
    data: bytes.toString("base64"),
  };
}

function deserializeResponse(wire: WireResponse): GuardResponse {
  return {
    isFlagged: wire.is_flagged ?? false,
    transformedPayload: wire.transformed_payload ?? null,
    findings: (wire.findings ?? []).map(
      (f): Finding => ({
        detectionType: f.detection_type,
        confidence: f.confidence,
        ruleName: f.rule_name,
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
