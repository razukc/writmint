# Changelog

All notable changes to Writmint will land here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-01

Initial release. Five pillars + the canonical triage demo.

### Added

- **Feature Manifest** (`src/feature-manifest.ts`) — typed, declarative
  contract describing a feature's id, version, capabilities, config schema,
  and actions.
- **Capabilities** (`src/capabilities.ts`) — broker-mediated boundary for
  network, storage, UI, clock, and audit. A feature only sees what its
  manifest declared; undeclared access throws a structured `CapabilityError`.
- **Structured errors** (`src/errors.ts`) — every error carries
  `{code, where, expected, actual, fixHint}` for deterministic recovery
  by automated callers.
- **Replay** (`src/replay.ts`) — record execution at the transport seam
  and replay deterministically with strict-ordered divergence detection.
- **Approval lifecycle + audit** (`src/approval.ts`) — `draft → submitted →
  approved → active → revoked`, SHA-256-bound to manifest content,
  audit-emitted with manifest-declared redaction.
- **Canonical demo** (`fixtures/suspicious-transaction-triage/`) — analyst
  triage flow exercising all five pillars across phases A–H, including
  chaos-transport failure-path correctness in phase H.
- 737 tests across `tests/{unit,integration,property}`.
- `npm run demo` chains all four demo entry points
  (`demo:smoke`, `demo:approval`, `demo:replay`, `demo:e2e`).
- License: Apache-2.0 with explicit patent grant.
- `SECURITY.md` for private vulnerability reports.
- `CONTRIBUTING.md` for issue/PR shape.

### Notes

- Pre-stable. Public API surface may change before v1.0.
- Requires Node ≥ 22.

[0.1.0]: https://github.com/razukc/writmint/releases/tag/v0.1.0
