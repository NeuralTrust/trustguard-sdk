# Security Policy

## Supported versions

Only the latest released version of each SDK receives security fixes.

| Package | Supported |
|---|---|
| `@neuraltrust/trustguard-sdk` (npm) | latest release |
| `neuraltrust-trustguard` (PyPI) | latest release |
| `github.com/NeuralTrust/trustguard-sdk/go` | latest `go/vX.Y.Z` tag |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/NeuralTrust/trustguard-sdk/security/advisories/new) for this repository. Include:

- The affected SDK and version
- A description of the issue and its impact
- Steps to reproduce or a proof of concept

We will acknowledge reports within 5 business days. Please give us a reasonable window to ship a fix before any public disclosure.

## Scope notes

These SDKs are thin HTTP clients. Keep in mind:

- **API keys are secrets.** Never hardcode them; load them from your secret manager or environment. The SDKs never log or persist the key.
- The SDKs send payloads to the TrustGuard deployment you configure — vulnerabilities in the TrustGuard server itself should be reported to the corresponding project, not this repository.
