"""Error types raised by the TrustGuard client."""

from __future__ import annotations

import json

import httpx


class TrustGuardAPIError(Exception):
    """A non-2xx response from the TrustGuard API.

    Carries the status code and the correlation ids needed to chase the request
    in telemetry. Transport-level failures (network errors, timeouts) surface as
    ``httpx`` exceptions instead.
    """

    def __init__(self, status_code: int, message: str, trace_id: str = "", request_id: str = "") -> None:
        super().__init__(
            f"TrustGuard API error {status_code}: {message} (trace_id={trace_id}, request_id={request_id})"
        )
        self.status_code = status_code
        self.message = message
        self.trace_id = trace_id
        self.request_id = request_id

    @classmethod
    def from_response(cls, response: httpx.Response) -> TrustGuardAPIError:
        """Map a non-2xx response onto an error, tolerating non-JSON bodies."""
        message: str | None = None
        trace_id = ""
        request_id = ""
        try:
            payload = response.json()
        except (json.JSONDecodeError, ValueError):
            payload = None
        if isinstance(payload, dict):
            message = payload.get("error")
            trace_id = payload.get("trace_id", "")
            request_id = payload.get("request_id", "")
        if not message:
            message = response.text.strip() or f"HTTP {response.status_code}"
        return cls(response.status_code, message, trace_id, request_id)
