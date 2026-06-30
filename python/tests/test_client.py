"""Behavioral tests for the sync and async guard clients (respx-mocked HTTP)."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from trustguard import AsyncTrustGuard, Attachment, Finding, TrustGuard, TrustGuardAPIError

BASE_URL = "https://guard.neuraltrust.ai"
GUARD_URL = f"{BASE_URL}/v1/guard"

OK_BODY = {
    "status": "",
    "transformed_payload": None,
    "findings": [],
    "trace_id": "t-1",
    "request_id": "r-1",
}

FLAGGED_BODY = {
    "status": "block",
    "transformed_payload": {"prompt": "[MASKED]"},
    "findings": [
        {
            "detection_type": "jailbreak",
            "confidence": 0.97,
            "rule_name": "jb-1",
            "status": "block",
            "policy_id": "p-1",
            "detector_id": "d-1",
            "action": "block",
            "details": {"plugin": "jailbreak"},
        }
    ],
    "trace_id": "t-2",
    "request_id": "r-2",
}


@pytest.mark.parametrize(
    ("base_url", "api_key"),
    [("", "key"), ("   ", "key"), (BASE_URL, ""), (BASE_URL, "  ")],
)
def test_constructor_validates_config(base_url: str, api_key: str) -> None:
    with pytest.raises(ValueError):
        TrustGuard(base_url, api_key)
    with pytest.raises(ValueError):
        AsyncTrustGuard(base_url, api_key)


@respx.mock
def test_guard_sends_expected_request() -> None:
    route = respx.post(GUARD_URL).mock(return_value=httpx.Response(200, json=OK_BODY))

    with TrustGuard(BASE_URL + "/", "secret-key") as client:
        client.guard(
            {"input": "hello"},
            direction="output",
            protocol="llm",
            collector_key="ck-1",
            session_id="s-1",
            consumer_id="u-1",
            attributes={"content_type": "text/plain"},
        )

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer secret-key"
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == {
        "payload": {"input": "hello"},
        "direction": "output",
        "protocol": "llm",
        "collector_key": "ck-1",
        "session_id": "s-1",
        "consumer_id": "u-1",
        "attributes": {"content_type": "text/plain"},
    }


@respx.mock
def test_guard_omits_empty_optional_fields() -> None:
    route = respx.post(GUARD_URL).mock(return_value=httpx.Response(200, json=OK_BODY))

    with TrustGuard(BASE_URL, "key") as client:
        client.guard({"input": "hi"})

    # The server rejects unknown top-level fields, so empty optionals must be absent.
    assert json.loads(route.calls.last.request.content) == {"payload": {"input": "hi"}}


@respx.mock
def test_guard_folds_attachments_into_payload() -> None:
    route = respx.post(GUARD_URL).mock(return_value=httpx.Response(200, json=OK_BODY))

    with TrustGuard(BASE_URL, "key") as client:
        client.guard(
            {"input": "hi"},
            attachments=[
                Attachment(filename="doc.txt", content_type="text/plain", data="hello"),
                Attachment(filename="img.png", content_type="image/png", data=b"\x89\x50"),
                Attachment(filename="report.txt", content_type="text/plain", url="https://example.com/r.txt"),
            ],
        )

    body = json.loads(route.calls.last.request.content)
    assert body["payload"]["attachments"] == [
        {"filename": "doc.txt", "content_type": "text/plain", "data": "aGVsbG8="},
        {"filename": "img.png", "content_type": "image/png", "data": "iVA="},
        {"filename": "report.txt", "content_type": "text/plain", "url": "https://example.com/r.txt"},
    ]


@respx.mock
def test_guard_parses_flagged_response() -> None:
    respx.post(GUARD_URL).mock(return_value=httpx.Response(200, json=FLAGGED_BODY))

    with TrustGuard(BASE_URL, "key") as client:
        response = client.guard({"input": "hi"})

    assert response.status == "block"
    assert response.is_blocked is True
    assert response.transformed_payload == {"prompt": "[MASKED]"}
    assert response.findings == [
        Finding(
            detection_type="jailbreak",
            confidence=0.97,
            rule_name="jb-1",
            status="block",
            policy_id="p-1",
            detector_id="d-1",
            action="block",
            details={"plugin": "jailbreak"},
        )
    ]
    assert response.trace_id == "t-2"
    assert response.request_id == "r-2"


@respx.mock
@pytest.mark.parametrize(
    ("status", "body", "expected_message"),
    [
        (
            401,
            json.dumps({"error": "invalid API key", "trace_id": "t", "request_id": "r"}),
            "invalid API key",
        ),
        (502, "bad gateway", "bad gateway"),
        (500, "", "HTTP 500"),
    ],
)
def test_guard_raises_api_error(status: int, body: str, expected_message: str) -> None:
    respx.post(GUARD_URL).mock(return_value=httpx.Response(status, text=body))

    with TrustGuard(BASE_URL, "key") as client, pytest.raises(TrustGuardAPIError) as exc_info:
        client.guard({"input": "hi"})

    assert exc_info.value.status_code == status
    assert exc_info.value.message == expected_message


def test_guard_requires_payload() -> None:
    with TrustGuard(BASE_URL, "key") as client, pytest.raises(ValueError):
        client.guard(None)  # type: ignore[arg-type]


@respx.mock
async def test_async_guard_round_trip() -> None:
    route = respx.post(GUARD_URL).mock(return_value=httpx.Response(200, json=FLAGGED_BODY))

    async with AsyncTrustGuard(BASE_URL, "secret-key") as client:
        response = await client.guard({"input": "hi"}, session_id="s-9")

    assert response.is_blocked is True
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer secret-key"
    assert json.loads(request.content) == {"payload": {"input": "hi"}, "session_id": "s-9"}


@respx.mock
async def test_async_guard_raises_api_error() -> None:
    respx.post(GUARD_URL).mock(
        return_value=httpx.Response(
            403,
            json={"error": "policy not allowed for this api key", "trace_id": "t-3", "request_id": "r-3"},
        )
    )

    async with AsyncTrustGuard(BASE_URL, "key") as client:
        with pytest.raises(TrustGuardAPIError) as exc_info:
            await client.guard({"input": "hi"})

    assert exc_info.value.status_code == 403
    assert exc_info.value.trace_id == "t-3"
    assert exc_info.value.request_id == "r-3"
