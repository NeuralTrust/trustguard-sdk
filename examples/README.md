# Examples

Runnable examples for each SDK. They all expect two environment variables:

```bash
export TRUSTGUARD_BASE_URL="https://guard.neuraltrust.ai"
export TRUSTGUARD_API_KEY="your-collector-api-key"
```

| Directory | What it shows |
|---|---|
| [`node/`](node/) | Basic guard call and attachment scanning with the npm package |
| [`ai-sdk/`](ai-sdk/) | A Next.js chat agent guarded end to end through `@neuraltrust/trustguard-sdk/ai-sdk`, with tool approvals and a live verdict panel |
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

### Vercel AI SDK

```bash
cd examples/ai-sdk
npm install && npm run sdk
cp .env.example .env.local   # add an OpenAI key and a TOOL_APPROVAL_SECRET
npm run dev
```

See [`ai-sdk/README.md`](ai-sdk/README.md) for the policy that shows every path.

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
