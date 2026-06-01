# Changelog

All notable changes to Writmint will land here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking changes

#### MCP handler response shape — tagged-union envelope

The text body of every MCP tool call now follows a tagged union:

```jsonc
// success (envelope.isError unset)
{ "ok": true,  "data":   { /* handler-specific */ } }

// failure (envelope.isError === true)
{ "ok": false, "errors": [ /* StructuredError[] */ ] }
```

The MCP-level `isError` flag and inner-text `ok` are redundant by
design and never disagree: callers can branch on either channel and
reach the same conclusion. Pre-v0.3.2, every handler had its own
success shape (`{hash}`, `{state, hash, manifestId}`, etc.) and the
error path was a bare `StructuredError` object. `validate_manifest`
was further inconsistent — its rejection rode the success arm of the
envelope as `{ok:false, errors}` while every other handler used
`isError:true`. Robotic callers had to branch on shape, not on `ok`,
and `validate_manifest` callers had to branch *twice* (once on the
envelope, once on the inner `ok`).

The new envelope collapses all of that. Migration:

```diff
-  const text = JSON.parse(result.content[0].text);
-  if (result.isError) {
-    // text is a bare StructuredError
-    recover(text);
-  } else {
-    // text is {hash}, {state,...}, {events}, etc.
-    use(text);
-  }
+  const env = JSON.parse(result.content[0].text);
+  if (env.ok) {
+    use(env.data);
+  } else {
+    recover(env.errors); // always an array
+  }
```

Surfaced by v0.3 candidate #3. Affects every MCP consumer; the change
is wire-level and cannot be opted out. v0.3.1 client code does not
deserialize v0.3.2 server output cleanly.

`replay`'s divergence finding stays in the success arm
(`{ok:true, data:{divergence}}`) because divergence is a successful
detection, not a failure to detect.

### Added

- **`RuntimeError.allErrors`** — `RuntimeError` carries `readonly
  allErrors: readonly StructuredError[]` alongside the existing
  `structured: StructuredError`, mirroring v0.3.1's `ApprovalError`
  change. The constructor accepts either the old 2-arg shape
  (`new RuntimeError(s, { cause })`) or the new 3-arg shape
  (`new RuntimeError(s, allErrors, { cause? })`) — existing throws
  keep working unchanged. `wrapStructured` in the MCP layer pulls
  `allErrors` when present, so a single thrown `RuntimeError` carrying
  N violations surfaces all N in the wire response without further
  plumbing. Used by the `validate_manifest` handler to surface every
  `verifyManifest` violation on one MCP call.

## [0.3.1] — 2026-05-31

A patch release that closes the last short-circuit in the authoring
rejection path. Every Writmint check is internally exhaustive — the
structural validator collects all errors before returning, hardening
collects all errors before returning, the unknown-field rule warns on
every offender — but the *pipeline between stages* was fail-fast. A
first-draft manifest with one structural error and four hardening
errors returned one error, forced the agent to fix it, retry, see the
next four, and pay a second round-trip. v0.3.1 collapses both seams
(the MCP `validate_manifest` / hook boundary, and the `submit()`
boundary) so every authoring rejection arrives complete. Pure-additive
— no breaking changes; existing call sites that use
`validateCapabilityManifest`, `hardenManifest`, or read
`ApprovalError.structured` keep working unchanged.

### Added

- **`verifyManifest()`** — new combined entry point on
  `src/capability-manifest.ts` that runs structural validation and
  hardening in one pass and returns `{ valid, errors, warnings }`.
  Structural errors mark broken subtrees (e.g. a `permissions[2]` that
  isn't an object, a non-array `actions`) and hardening skips those
  subtrees while still running on the rest of the manifest. The dogfood
  round-trip ceiling for a mixed structural-and-hardening first draft
  drops from 2 to 1 because every violation surfaces in the first
  rejection payload. The MCP `validate_manifest` handler and the Layer
  3 hook script (`tools/dogfood/validate-on-write.ts`) now call
  `verifyManifest()`; `validateCapabilityManifest()` and
  `hardenManifest()` are still exported for callers that want each
  stage separately. `hardenManifest()` grew an optional
  `{ skipPaths?: ReadonlySet<string> }` second argument so it can be
  composed cleanly with structural-validation output. Surfaced by
  dogfood pass 06: a manifest with 1 structural and 4 hardening
  violations returned 1 error pre-`verifyManifest`; reproducing the
  same fixture now returns 5. 9 new tests pin the rule.

- **`ApprovalError.allErrors`** — `ApprovalError` carries `readonly
  allErrors: readonly StructuredError[]` alongside the existing
  `structured: StructuredError`. `submit()` now populates `allErrors`
  with every hardening error rather than just the first; existing
  callers that read `.structured` keep working unchanged because that
  field still points to the first entry of `allErrors`. Closes the
  in-stage short-circuit at the `submit()` boundary the same way
  `verifyManifest()` closes it at the validate-manifest boundary.

### Notes

- 823 tests pass.
- Pre-stable. Public API surface may still change before v1.0.
- Requires Node ≥ 22.

[0.3.1]: https://github.com/razukc/writmint/releases/tag/v0.3.1

## [0.3.0] — 2026-05-31

A minor release with two pure-additive hardening features, both surfaced
by the dogfood harness running against the MCP server. No breaking
changes; existing manifests continue to validate, submit, and approve
unchanged. The companion `writmint-authoring` skill grew a destructive-
actions section spelling out the `submit()`-silent / `approve()`-loud
behavior that pass 03b documented.

### Added

- **`manifest.unknown_field` hardening warning** — `hardenManifest()` now
  surfaces a structured warning for any field that isn't part of the v1
  schema at the manifest top-level, inside a permission (canonical key
  set varies by permission `type`), or inside an action. Surfaced by
  dogfood pass 05: an agent authoring without the `writmint-authoring`
  skill shipped a manifest with stray `kind` fields on permissions and a
  stray `title` field on an action; the validator silently accepted them.
  Accepted-and-ignored read as accepted-and-meaningful, which is the
  authoring-time footgun the warning closes. JSONSchema bodies inside
  `input` / `output` / `config` are not checked — `additionalProperties`
  and similar are legitimate JSONSchema fields, not Writmint errors.
  Warning, not error: it's the safer first cut; can be promoted later
  after the warning has been observed in dogfood for a release. 7 new
  tests pin the rule.

- **Opt-in two-person rule on destructive approval** — `ActionManifest`
  now carries an optional `requireDistinctDestructiveApprover: boolean`.
  When `true` on any destructive action, `approve()` rejects identical
  `approvedBy` and `destructiveApprovedBy` with the new structured code
  `approval.destructive.same_approver`. The existing `destructive_required`
  check still runs first (missing field beats identity check), and a
  non-destructive action setting the flag is a no-op (`destructive: true`
  is the trigger, not the flag alone). The flag lives per-action so it
  is hash-bound — a same-actor approval cannot be done by unflagging
  post-submit. Surfaced by dogfood pass 03b: `approvedBy` and
  `destructiveApprovedBy` were both free-form strings with no required-
  distinct check, so anyone who knew one string knew the other,
  defeating the point of a two-person gate. Opt-in (not strict by
  default) so carryover destructive capabilities keep working. 9 new
  approval tests cover both the existing `destructive_required` gate
  (no prior coverage) and the new same-approver rule.

### Notes

- 813 tests pass.
- Pre-stable. Public API surface may still change before v1.0.
- Requires Node ≥ 22.

[0.3.0]: https://github.com/razukc/writmint/releases/tag/v0.3.0

## [0.2.1] — 2026-05-25

A patch release that closes a replay-divergence bug class surfaced by the
first dogfood pass through the Writmint MCP server. Recordings cross JSON
boundaries (MCP wire, on-disk fixtures), where `JSON.stringify` drops
`undefined`-valued keys. The in-memory `deepEqual` was strict about key
presence, so any broker call with an undefined optional field (audit.emit
with no payload, storage.list with no prefix, storage.put with undefined
key/value, etc.) diverged after a wire round-trip — with `expected` and
`actual` rendering identically because `stringify` dropped the same keys
on the display side. Unactionable from the agent's seat.

### Fixed

- `deepEqual` in `src/replay.ts` is now JSON-semantic: undefined-valued
  keys are treated as absent on both sides, matching what survives the
  wire. One change at the comparator closes the bug class for every
  current and future broker path with optional fields.
- Site-level hardening: `audit.emit` and `storage.list` recorders/replayers
  now also omit undefined fields before push. This is redundant with the
  comparator fix but reduces wire payload size and is symmetrical with the
  shape the comparator expects.

### Added

- `tests/unit/replay-json-stability.test.ts` pins the wire round-trip
  property for `audit.emit` (no payload), `audit.emit` (non-envelope
  payload), `storage.put` (undefined key/value), and `storage.list` (no
  prefix). 775 tests pass; 24 demo assertions still green.

## [0.2.0] — 2026-05-15

A **breaking** release. The public API splits its vocabulary into an outer
identity layer (the *capability* — the manifest as a unit of governance)
and an inner permission layer (the individual grants the manifest
declares). Adds manifest hardening that runs at submit-time so an agent
gets a structured rejection before approval, not after.

### Breaking changes

#### Outer identity layer renamed: feature → capability

The manifest itself, the lifecycle around it, and the audit envelope all
move to *capability* vocabulary.

| v0.1 | v0.2 |
|---|---|
| `FeatureManifest` | `CapabilityManifest` |
| `MemoryFeatureStore` | `MemoryCapabilityStore` |
| `FeatureStore` interface | `CapabilityStore` |
| `FeatureRecord` | `CapabilityRecord` |
| `FeatureStatus` | `CapabilityStatus` |
| `ApproveInput.featureId` | `ApproveInput.capabilityId` |
| `AuditEvent.featureId` / `featureVersionHash` | `AuditEvent.capabilityId` / `capabilityVersionHash` |
| `AuditEventKind` value `feature_emit` | `capability_emit` (and `capability_call` / `capability_denied`) |
| error code `approval.unknown_feature` | `approval.unknown_capability` |
| `src/feature-manifest.ts` | `src/capability-manifest.ts` |

#### Inner permission layer renamed: capabilities[] → permissions[]

Inside the manifest, what v0.1 called *capabilities* (one per permission
grant) is now *permissions*. The error vocabulary follows.

| v0.1 | v0.2 |
|---|---|
| `CapabilityManifest.capabilities[]` (was on FeatureManifest) | `permissions[]` |
| `ActionManifest.capabilities[]` | `permissions[]` |
| `CapabilityError` class | `PermissionError` |
| broker envelope field `capabilityId` (inner) | `permissionId` |
| `AuditTransport.emit({capabilityId,…})` | `AuditTransport.emit({permissionId,…})` |
| `createFeatureCapabilityRegistry()` | `createPermissionRegistry()` |
| `src/capabilities.ts` | `src/permissions.ts` |
| `capability.*` error codes (`capability.denied`, `capability.network.host_denied`, `capability.storage.write_denied`, `capability.undeclared`, `capability.action.unknown`, `capability.audit.no_transport`, …) | `permission.*` (same suffixes) |
| `manifest.capabilities.type` validator code | `manifest.permissions.type` |
| `action.capability_ref.type` / `.unknown` | `action.permission_ref.type` / `.unknown` |

The outer `capabilityId` on `AuditEvent` is the manifest identity; the
inner `permissionId` (also on `AuditEvent`, and on the broker emit
envelope) is the specific permission entry the event came through. Both
fields ride on every event.

#### Hash shift

`hashManifest()` is unchanged in algorithm, but every shipped manifest
will produce a different `versionHash` under v0.2 because the renamed
object keys (`permissions[]`, etc.) are part of the canonical hash input.
**Re-submit and re-approve any manifest carried over from v0.1.**

### Added

- **`hardenManifest()`** (`src/capability-manifest.ts`) — runs after
  structural validation. Enforces five strictness rules that an approver
  would otherwise have to check by eye:
  - `permission.reason.too_short` — every `reason` must be ≥ 5 words.
  - `action.description.too_short` — every action `description` must be
    ≥ 5 words.
  - `permission.network.host_wildcard` — no `*` in any allowed host.
  - `permission.storage.scope_wildcard` — no `*` in any storage scope.
  - `permission.reason.no_action_ref` (warning) — every permission's
    reason should mention at least one action that references it.
- **`ApprovalLifecycle.submit()`** now runs `hardenManifest()` and throws
  `ApprovalError` on the first hardening error. The new return shape
  `SubmitResult` extends `CapabilityRecord` with a `warnings:
  ManifestWarning[]` field carrying non-blocking signals (e.g. the
  no-action-ref warning).
- 13 new tests covering each hardening rule (positive + negative) and
  `submit()` wiring. Total test count: **737 → 750**.
- README rewritten around a *show-by-failing* opener: the agent writes a
  manifest with a wildcard host, `submit()` rejects it with a verified
  structured error, the agent fixes and resubmits. Locks the tagline:
  *"Writmint is a verifier for capabilities an author can't author past."*

### Changed

- `fixtures/suspicious-transaction-triage/manifest.ts` — every
  `permission.reason` now opens with "Used by `<action.id>`…" so the
  fixture passes hardening with **0 errors, 0 warnings**.

### Notes

- Pre-stable. Public API surface may change before v1.0.
- Requires Node ≥ 22.
- All 24 demo phases still pass.

[0.2.0]: https://github.com/razukc/writmint/releases/tag/v0.2.0

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
