import { TrustGuardAPIError } from "./errors.js";
import type {
  Attachment,
  Finding,
  FindingOutcome,
  FindingSignal,
  FindingSource,
  GuardRequest,
  GuardResponse,
  TrustGuardOptions,
} from "./types.js";

const EVALUATE_PATH = "/v1/evaluate";
const DEFAULT_TIMEOUT_MS = 10_000;

interface WireFindingSource {
  kind?: string;
  plugin?: string;
  detector_id?: string;
  detector_name?: string;
  policy_id?: string;
  gate_name?: string;
}

interface WireFindingSignal {
  type?: string;
  confidence?: number;
}

interface WireFindingOutcome {
  action?: string;
}

interface WireFinding {
  source?: WireFindingSource;
  signal?: WireFindingSignal;
  outcome?: WireFindingOutcome;
  evidence?: Record<string, unknown>;
}

interface WireResponse {
  status?: string;
  transformed_payload?: Record<string, unknown> | null;
  findings?: WireFinding[];
  trace_id?: string;
  request_id?: string;
}

/** Client for the TrustGuard runtime evaluate API. */
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

    const response = await this.#fetch(this.#baseUrl + EVALUATE_PATH, {
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
    const bytes = typeof attachment.data === "string" ? new TextEncoder().encode(attachment.data) : attachment.data;
    entry.data = toBase64(bytes);
  }
  if (attachment.url !== undefined) entry.url = attachment.url;
  return entry;
}

/** Base64 without Buffer, so the client also runs on edge runtimes. Chunked to stay under the argument limit of fromCharCode. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function deserializeResponse(wire: WireResponse): GuardResponse {
  const status = wire.status ?? "";
  return {
    status,
    isBlocked: status === "block",
    transformedPayload: wire.transformed_payload ?? null,
    findings: (wire.findings ?? []).map(deserializeFinding),
    traceId: wire.trace_id ?? "",
    requestId: wire.request_id ?? "",
  };
}

function deserializeFinding(f: WireFinding): Finding {
  const sourceWire = f.source ?? {};
  const source: FindingSource = {
    kind: sourceWire.kind ?? "",
  };
  if (sourceWire.plugin !== undefined) source.plugin = sourceWire.plugin;
  if (sourceWire.detector_id !== undefined) source.detectorId = sourceWire.detector_id;
  if (sourceWire.detector_name !== undefined) source.detectorName = sourceWire.detector_name;
  if (sourceWire.policy_id !== undefined) source.policyId = sourceWire.policy_id;
  if (sourceWire.gate_name !== undefined) source.gateName = sourceWire.gate_name;

  const finding: Finding = { source };
  if (f.signal?.type) {
    const signal: FindingSignal = { type: f.signal.type };
    if (f.signal.confidence !== undefined) signal.confidence = f.signal.confidence;
    finding.signal = signal;
  }
  if (f.outcome?.action) {
    const outcome: FindingOutcome = { action: f.outcome.action };
    finding.outcome = outcome;
  }
  if (f.evidence && Object.keys(f.evidence).length > 0) {
    finding.evidence = f.evidence;
  }
  return finding;
}

function apiError(status: number, text: string): TrustGuardAPIError {
  const payload = parseJson(text) as { error?: string; message?: string; trace_id?: string; request_id?: string } | undefined;
  const message = payload?.error || payload?.message || text.trim() || `HTTP ${status}`;
  return new TrustGuardAPIError(status, message, payload?.trace_id ?? "", payload?.request_id ?? "");
}

function parseJson(text: string): WireResponse | undefined {
  try {
    return JSON.parse(text) as WireResponse;
  } catch {
    return undefined;
  }
}
