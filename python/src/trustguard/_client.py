"""Sync and async clients for the TrustGuard runtime guard API."""

from __future__ import annotations

from types import TracebackType
from typing import Any

import httpx

from ._errors import TrustGuardAPIError
from ._models import Attachment, GuardResponse, build_payload

_GUARD_PATH = "/v1/guard"
_DEFAULT_TIMEOUT = 10.0


def _validate_config(base_url: str, api_key: str) -> str:
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url:
        raise ValueError("trustguard: base_url is required")
    if not (api_key or "").strip():
        raise ValueError("trustguard: api_key is required")
    return base_url


def _headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def _parse(response: httpx.Response) -> GuardResponse:
    if response.status_code < 200 or response.status_code >= 300:
        raise TrustGuardAPIError.from_response(response)
    return GuardResponse.from_wire(response.json())


class TrustGuard:
    """Synchronous client. Configure a base URL and an API key, then call :meth:`guard`.

    Usable as a context manager; call :meth:`close` otherwise.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout: float = _DEFAULT_TIMEOUT,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._base_url = _validate_config(base_url, api_key)
        self._api_key = api_key
        self._client = http_client or httpx.Client(timeout=timeout)

    def guard(
        self,
        payload: dict[str, Any],
        *,
        direction: str | None = None,
        protocol: str | None = None,
        collector_key: str | None = None,
        gateway_id: str | None = None,
        session_id: str | None = None,
        consumer_id: str | None = None,
        attributes: dict[str, Any] | None = None,
        attachments: list[Attachment] | None = None,
    ) -> GuardResponse:
        """Evaluate ``payload`` against the collector's policy.

        Address the collector with ``collector_key`` or ``gateway_id`` when using
        a service token; omit both when the API key is bound to a collector.
        Raises :class:`TrustGuardAPIError` on non-2xx responses.
        """
        body = build_payload(
            payload,
            direction=direction,
            protocol=protocol,
            collector_key=collector_key,
            gateway_id=gateway_id,
            session_id=session_id,
            consumer_id=consumer_id,
            attributes=attributes,
            attachments=attachments,
        )
        response = self._client.post(
            self._base_url + _GUARD_PATH, json=body, headers=_headers(self._api_key)
        )
        return _parse(response)

    def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        self._client.close()

    def __enter__(self) -> TrustGuard:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()


class AsyncTrustGuard:
    """Asynchronous client mirroring :class:`TrustGuard`.

    Usable as an async context manager; call :meth:`aclose` otherwise.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout: float = _DEFAULT_TIMEOUT,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = _validate_config(base_url, api_key)
        self._api_key = api_key
        self._client = http_client or httpx.AsyncClient(timeout=timeout)

    async def guard(
        self,
        payload: dict[str, Any],
        *,
        direction: str | None = None,
        protocol: str | None = None,
        collector_key: str | None = None,
        gateway_id: str | None = None,
        session_id: str | None = None,
        consumer_id: str | None = None,
        attributes: dict[str, Any] | None = None,
        attachments: list[Attachment] | None = None,
    ) -> GuardResponse:
        """Evaluate ``payload`` against the collector's policy.

        Address the collector with ``collector_key`` or ``gateway_id`` when using
        a service token; omit both when the API key is bound to a collector.
        Raises :class:`TrustGuardAPIError` on non-2xx responses.
        """
        body = build_payload(
            payload,
            direction=direction,
            protocol=protocol,
            collector_key=collector_key,
            gateway_id=gateway_id,
            session_id=session_id,
            consumer_id=consumer_id,
            attributes=attributes,
            attachments=attachments,
        )
        response = await self._client.post(
            self._base_url + _GUARD_PATH, json=body, headers=_headers(self._api_key)
        )
        return _parse(response)

    async def aclose(self) -> None:
        """Release the underlying HTTP connection pool."""
        await self._client.aclose()

    async def __aenter__(self) -> AsyncTrustGuard:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()
