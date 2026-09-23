# Contributing

Thanks for your interest in improving the TrustGuard SDKs. This repo hosts three independent packages — Node.js (`node/`), Python (`python/`), and Go (`go/`) — that share one API contract: `POST /v1/evaluate`.

## Ground rules

- **Keep the SDKs thin.** They are typed HTTP clients for a single endpoint. Features like retries, caching, or enforcement logic belong in the caller, not here.
  The one exception is a framework integration, which exists to enforce verdicts inside that framework. It ships as its own entry point (for example `@neuraltrust/trustguard-sdk/ai-sdk`), takes the framework as an optional peer dependency, and is never imported by the main entry point.
- **Keep the three SDKs consistent.** A contract change (new field, new error shape) should land in all three packages in the same PR whenever possible.
- **Every code path needs tests.** All three packages mock the HTTP layer — no network access in tests.
- **Conventional commits**: `type(scope): subject`, e.g. `feat(python): add attachment helper` or `fix(go): tolerate non-JSON error bodies`. Scopes: `node`, `python`, `go`, `ci`, `docs`.

## Development setup

### Node (`node/`)

```bash
cd node
npm install
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # tsup (ESM + CJS + d.ts)
```

Node.js 18+ required. The package has zero runtime dependencies — please keep it that way.

### Python (`python/`)

```bash
cd python
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
ruff check .
pytest
```

Python 3.9+ supported; CI tests 3.9 and 3.12. `httpx` is the only runtime dependency.

### Go (`go/`)

```bash
cd go
gofmt -l .     # must print nothing
go vet ./...
go test -race ./...
```

Go 1.22+. The module is stdlib-only — please keep it dependency-free.

## Pull requests

1. Fork and create a feature branch (never commit to `main`).
2. Make your change with tests; run the full check for every package you touched.
3. Update the package README and `CHANGELOG.md` when behavior changes.
4. Open a PR. CI runs path-filtered jobs, so a Python-only change only runs the Python suite.

## API contract changes

The wire format is defined by the TrustGuard server (`POST /v1/evaluate`). If the server contract changes:

1. Update the models in all three packages (`go/types.go`, `node/src/types.ts`, `python/src/trustguard/_models.py`).
2. Mirror the change in each client's serialization tests.
3. Note one important server behavior: unknown top-level request fields are **rejected**, so SDKs must omit empty optionals rather than sending `null`s.

## Releasing (maintainers)

Each package versions and releases independently. `scripts/release.sh` writes
the manifest (and lockfile) for Node or Python, or just tags Go:

```bash
scripts/release.sh all 0.1.4 --tag --push  # node + python + go, one commit, three tags
scripts/release.sh node 0.1.4              # bump node/package.json only
scripts/release.sh python tag --push       # tag whatever is already in pyproject
scripts/release.sh go 0.1.0 --tag --push   # tag go/v0.1.0
```

Update `CHANGELOG.md` in the same change as a bump. Then push the tag:

| Package | Tag | Effect |
|---|---|---|
| Node | `node-vX.Y.Z` | **Publish Node SDK** → npm |
| Python | `python-vX.Y.Z` | **Publish Python SDK** → PyPI |
| Go | `go/vX.Y.Z` | nothing to upload; consumers fetch the module from git |
