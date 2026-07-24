"""Typed request/response models for the evaluate endpoint."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

#: Attributes key that overrides the payload content type (default application/json).
ATTRIBUTES_CONTENT_TYPE = "content_type"
#: Payload key that carries base64-encoded documents for file-aware plugins.
PAYLOAD_ATTACHMENTS = "attachments"

#: Status reported when the policy allows the payload.
STATUS_ALLOW = "allow"
#: Status reported when the policy blocks the payload.
STATUS_BLOCK = "block"
#: Status reported when a masking plugin rewrote the payload.
STATUS_TRANSFORM = "transform"
#: Status reported when a finding is logged without enforcement.
STATUS_REPORT = "report"


@dataclass
class Attachment:
    """A document evaluated alongside the payload by file-aware plugins.

    Provide either ``data`` (raw bytes; ``str`` values are encoded as UTF-8 and
    base64-encoded on the wire) or ``url`` (fetched server-side).
    """

    filename: str
    content_type: str
    data: bytes | str | None = None
    url: str | None = None

    def to_wire(self) -> dict[str, str]:
        """Return the wire representation, base64-encoding inline data."""
        wire: dict[str, str] = {"filename": self.filename, "content_type": self.content_type}
        if self.data is not None:
            raw = self.data.encode("utf-8") if isinstance(self.data, str) else self.data
            wire["data"] = base64.b64encode(raw).decode("ascii")
        if self.url is not None:
            wire["url"] = self.url
        return wire


@dataclass
class FindingSource:
    """Who produced the finding — a detector or a gate."""

    kind: str = ""
    plugin: str | None = None
    detector_id: str | None = None
    detector_name: str | None = None
    policy_id: str | None = None
    gate_name: str | None = None

    @classmethod
    def from_wire(cls, wire: dict[str, Any] | None) -> FindingSource:
        wire = wire or {}
        return cls(
            kind=wire.get("kind") or "",
            plugin=wire.get("plugin"),
            detector_id=wire.get("detector_id"),
            detector_name=wire.get("detector_name"),
            policy_id=wire.get("policy_id"),
            gate_name=wire.get("gate_name"),
        )


@dataclass
class FindingSignal:
    """Detection signal when the finding fired."""

    type: str
    confidence: float | None = None

    @classmethod
    def from_wire(cls, wire: dict[str, Any] | None) -> FindingSignal | None:
        if not wire or not wire.get("type"):
            return None
        return cls(type=wire["type"], confidence=wire.get("confidence"))


@dataclass
class FindingOutcome:
    """Applied execution-rule action when the finding enforced an outcome."""

    action: str

    @classmethod
    def from_wire(cls, wire: dict[str, Any] | None) -> FindingOutcome | None:
        if not wire or not wire.get("action"):
            return None
        return cls(action=wire["action"])


@dataclass
class Finding:
    """A single finding from the evaluate response.

    Observational (below-threshold) runs keep ``source`` + ``evidence`` only.
    """

    source: FindingSource = field(default_factory=FindingSource)
    signal: FindingSignal | None = None
    outcome: FindingOutcome | None = None
    evidence: dict[str, Any] | None = None

    @classmethod
    def from_wire(cls, wire: dict[str, Any]) -> Finding:
        """Build a Finding from the raw response item."""
        evidence = wire.get("evidence")
        return cls(
            source=FindingSource.from_wire(wire.get("source")),
            signal=FindingSignal.from_wire(wire.get("signal")),
            outcome=FindingOutcome.from_wire(wire.get("outcome")),
            evidence=evidence if isinstance(evidence, dict) else None,
        )


@dataclass
class GuardResponse:
    """Verdict returned by POST /v1/evaluate.

    TrustGuard detects; the caller enforces: block when :attr:`is_blocked` is true.
    """

    status: str = ""
    transformed_payload: dict[str, Any] | None = None
    findings: list[Finding] = field(default_factory=list)
    trace_id: str = ""
    request_id: str = ""

    @property
    def is_blocked(self) -> bool:
        """True when the policy blocked the payload (``status == "block"``)."""
        return self.status == STATUS_BLOCK

    @classmethod
    def from_wire(cls, wire: dict[str, Any]) -> GuardResponse:
        """Build a GuardResponse from the raw response body."""
        return cls(
            status=wire.get("status", ""),
            transformed_payload=wire.get("transformed_payload"),
            findings=[Finding.from_wire(f) for f in wire.get("findings") or []],
            trace_id=wire.get("trace_id", ""),
            request_id=wire.get("request_id", ""),
        )


def build_payload(
    payload: dict[str, Any],
    *,
    direction: str | None = None,
    protocol: str | None = None,
    session_id: str | None = None,
    consumer_id: str | None = None,
    attributes: dict[str, Any] | None = None,
    attachments: list[Attachment] | None = None,
) -> dict[str, Any]:
    """Build the wire body, omitting empty optionals (the server rejects unknown top-level fields)."""
    if payload is None:
        raise ValueError("trustguard: request payload is required")
    content = dict(payload)
    if attachments:
        content[PAYLOAD_ATTACHMENTS] = [a.to_wire() for a in attachments]
    body: dict[str, Any] = {"payload": content}
    if direction:
        body["direction"] = direction
    if protocol:
        body["protocol"] = protocol
    if session_id:
        body["session_id"] = session_id
    if consumer_id:
        body["consumer_id"] = consumer_id
    if attributes:
        body["attributes"] = attributes
    return body
