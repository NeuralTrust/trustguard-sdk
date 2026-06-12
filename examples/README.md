# Examples

Runnable examples for each SDK. They all expect two environment variables:

```bash
export TRUSTGUARD_BASE_URL="https://your-trustguard-deployment.example.com"
export TRUSTGUARD_API_KEY="your-collector-api-key"
```

| Directory | What it shows |
|---|---|
| [`node/`](node/) | Basic guard call and attachment scanning with the npm package |
| [`python/`](python/) | Sync, async, and attachment usage with the PyPI package |
| [`go/`](go/) | Basic guard call, error handling, and attachments in one program |

Each example wires the SDK from this repository directly (`file:` dependency, editable install, or `replace` directive), so you can run them against your local checkout without publishing anything.

## Running

### Node

```bash
cd examples/node
npm install
node basic.mjs
node attachments.mjs
```

### Python

```bash
cd examples/python
python3 -m venv .venv && source .venv/bin/activate
pip install -e ../../python
python basic.py
python async_basic.py
python attachments.py
```

### Go

```bash
cd examples/go
go run .
```
