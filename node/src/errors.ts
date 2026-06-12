/**
 * A non-2xx response from the TrustGuard API, carrying the status code and the
 * correlation ids needed to chase the request in telemetry. Transport-level
 * failures (network errors, timeouts) are thrown as-is instead.
 */
export class TrustGuardAPIError extends Error {
  readonly status: number;
  readonly traceId: string;
  readonly requestId: string;

  constructor(status: number, message: string, traceId: string, requestId: string) {
    super(`TrustGuard API error ${status}: ${message} (trace_id=${traceId}, request_id=${requestId})`);
    this.name = "TrustGuardAPIError";
    this.status = status;
    this.traceId = traceId;
    this.requestId = requestId;
  }
}
