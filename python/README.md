# TrustGuard Python SDK

Official Python client for the TrustGuard runtime guard API (`POST /v1/guard`). Configure a base URL and an API key, send the payload you want evaluated, and act on the verdict: TrustGuard detects, you enforce.

## Install

```bash
pip install neuraltrust-trustguard
```

Requires Python 3.9+. The only dependency is `httpx`.

## Usage

```python
from trustguard import TrustGuard

client = TrustGuard("https://guard.neuraltrust.ai", api_key="YOUR_API_KEY")

response = client.guard({"prompt": "user text to evaluate"})
if response.is_flagged:
    # block the request
    ...

client.close()  # or use the context manager below
```

As a context manager:

```python
with TrustGuard("https://guard.neuraltrust.ai", api_key="YOUR_API_KEY") as client:
    response = client.guard({"prompt": "user text"})
```

### Async

```python
from trustguard import AsyncTrustGuard

async with AsyncTrustGuard("https://guard.neuraltrust.ai", api_key="YOUR_API_KEY") as client:
    response = await client.guard({"prompt": "user text"})
```

### Options

```python
response = client.guard(
    {"prompt": "user text"},
    direction="output",            # "input" (default) or "output"
    session_id="conversation-42",  # groups multi-turn traffic
    consumer_id="user-7",          # the end user behind the request
)
```

### Attachments

Documents are base64-encoded into `metadata.attachments` for file-aware plugins:

```python
from trustguard import Attachment

response = client.guard(
    {"prompt": "summarize this file"},
    attachments=[Attachment(filename="doc.pdf", content_type="application/pdf", data=pdf_bytes)],
)
```

### Response

| Field | Meaning |
|---|---|
| `is_flagged` | The enforcement signal: block when `True` |
| `findings` | What every plugin in the policy chain reported (`detection_type`, `confidence`, `rule_name`, `details`) |
| `transformed_payload` | The payload as rewritten by in-flight masking, `None` when untouched |
| `trace_id` / `request_id` | Correlation ids for TrustGuard telemetry |

### Errors

Non-2xx responses raise `TrustGuardAPIError` with `status_code`, `message`, `trace_id` and `request_id`. Transport failures (timeouts, connection errors) raise the underlying `httpx` exceptions. The default timeout is 10 seconds (`timeout=` to change it); pass `http_client=` to supply your own configured `httpx.Client` / `httpx.AsyncClient`.

## Development

```bash
pip install -e '.[dev]'
ruff check .
pytest
```
