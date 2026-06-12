"""Typed request/response models for the guard endpoint."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

#: Metadata key that selects the policy when the API key allows more than one.
METADATA_POLICY_ID = "policy_id"
#: Metadata key that overrides the payload content type (default application/json).
METADATA_CONTENT_TYPE = "content_type"
#: Metadata key that carries base64-encoded documents for file-aware plugins.
METADATA_ATTACHMENTS = "attachments"


@dataclass
class Attachment:
    """A document evaluated alongside the payload by file-aware plugins.

    ``data`` is the raw file content; ``str`` values are encoded as UTF-8.
    Base64 encoding happens on the wire.
    """

    filename: str
    content_type: str
    data: bytes | str

    def to_wire(self) -> dict[str, str]:
        """Return the base64-encoded wire representation."""
        raw = self.data.encode("utf-8") if isinstance(self.data, str) else self.data
        return {
            "filename": self.filename,
            "content_type": self.content_type,
            "data": base64.b64encode(raw).decode("ascii"),
        }


@dataclass
class Finding:
    """A single plugin's contribution to the guard response."""

    detection_type: str | None = None
    confidence: float | None = None
    rule_name: str | None = None
    details: Any = None

    @classmethod
    def from_wire(cls, wire: dict[str, Any]) -> Finding:
        """Build a Finding from the raw response item."""
        return cls(
            detection_type=wire.get("detection_type"),
            confidence=wire.get("confidence"),
            rule_name=wire.get("rule_name"),
            details=wire.get("details"),
        )


@dataclass
class GuardResponse:
    """Verdict returned by POST /v1/guard.

    TrustGuard detects; the caller enforces: block when ``is_flagged`` is true.
    """

    is_flagged: bool = False
    transformed_payload: dict[str, Any] | None = None
    findings: list[Finding] = field(default_factory=list)
    trace_id: str = ""
    request_id: str = ""

    @classmethod
    def from_wire(cls, wire: dict[str, Any]) -> GuardResponse:
        """Build a GuardResponse from the raw response body."""
        return cls(
            is_flagged=bool(wire.get("is_flagged", False)),
            transformed_payload=wire.get("transformed_payload"),
            findings=[Finding.from_wire(f) for f in wire.get("findings") or []],
            trace_id=wire.get("trace_id", ""),
            request_id=wire.get("request_id", ""),
        )


def build_payload(
    input: dict[str, Any],
    *,
    direction: str | None = None,
    session_id: str | None = None,
    consumer_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    attachments: list[Attachment] | None = None,
) -> dict[str, Any]:
    """Build the wire payload, omitting empty optionals (the server rejects unknown top-level fields)."""
    if input is None:
        raise ValueError("trustguard: request input is required")
    payload: dict[str, Any] = {"input": input}
    if direction:
        payload["direction"] = direction
    if session_id:
        payload["session_id"] = session_id
    if consumer_id:
        payload["consumer_id"] = consumer_id
    merged = dict(metadata) if metadata else {}
    if attachments:
        merged[METADATA_ATTACHMENTS] = [a.to_wire() for a in attachments]
    if merged:
        payload["metadata"] = merged
    return payload
