# Writmint

**Writmint is a verifier for capabilities an author can't author past.**

You let an AI agent write a capability. Writmint refuses to let the capability do anything its manifest doesn't account for — and tells the agent exactly what to fix when it tries.

> Status: **v0.4.x — early.** API surface is stable enough for the demo below, not yet stable enough to depend on. Issues and feedback welcome.

---

## Show, by failing

An agent writes a capability that reads a flagged transaction and writes back a decision. Here is what Writmint does, in four beats.

### Beat 1 — The agent writes a manifest

```ts
const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: 'ops.fraud.triage',
  version: '0.1.0',
  title: 'Triage',
  description: 'Pull a flagged transaction and record the analyst decision.',
  permissions: [
    {
      type: 'network',
      id: 'core.transactions',
      hosts: ['*.internal'],            // <-- agent took a shortcut here
      methods: ['GET'],
      reason: 'Used by triage.load_alert to read the flagged transaction.',
    },
    // ...
  ],
  actions: [/* ... */],
  implementation: { type: 'module', entry: './impl.js' },
};
```

### Beat 2 — Submit, and watch it fail

```ts
const lifecycle = new ApprovalLifecycle(new MemoryCapabilityStore());
lifecycle.submit(manifest);
// throws ApprovalError {
//   code: 'permission.network.host_wildcard',
//   where: '$.permissions[0].hosts[0]',
//   expected: 'exact hostname (no wildcards)',
//   actual: '"*.internal"',
//   fixHint: 'List each allowed hostname explicitly; wildcards make the call surface impossible to audit.',
// }
```

The agent reads the structured error — `code`, `where`, `expected`, `actual`, `fixHint` — and edits the manifest. It is the same shape for every failure Writmint can produce. No string-parsing, no judgment call about what went wrong.

### Beat 3 — Fix, resubmit, approve

```ts
manifest.permissions[0].hosts = ['core-banking.internal'];

const submitted = lifecycle.submit(manifest);
// submitted.warnings === []  — hardening clean
// submitted.versionHash === 'sha256:…'  — bound to this exact manifest

const approved = lifecycle.approve({
  capabilityId: manifest.id,
  versionHash: submitted.versionHash,
  approvedBy: 'reviewer@you.example',
});
```

Approval is bound to the SHA-256 of the manifest. Change one byte after this and the hash no longer matches — `assertRunnable` refuses to execute and asks for re-approval.

### Beat 4 — Run it; every call is brokered

```ts
const active = lifecycle.activate(manifest.id);
const sink = new MemoryAuditSink();
const transports = buildAuditingTransports({
  base: hostTransports,
  manifest,
  record: active,
  sink,
});

const registry = createPermissionRegistry(manifest, transports);
const scope = registry.forAction('triage.load_alert');
const net = scope.cap('core.transactions') as NetworkBroker;

await net.request({ url: 'https://core-banking.internal/tx/42', method: 'GET' });
// allowed.

await net.request({ url: 'https://evil.example.com/x', method: 'GET' });
// throws PermissionError {
//   code: 'permission.network.host_denied',
//   ...
// }
```

Every brokered call lands in `sink.events`. The recording is enough to replay the whole run later, deterministically, against the same inputs — and detect divergence in strict call order.

That is the entire loop: **declare → submit (hardened) → approve (hashed) → run (brokered) → replay (recorded)**. An agent who cannot read these errors cannot ship a capability past Writmint.

---

## The five pillars

Each pillar is one file in `src/`.

### 1. Capability manifest — the declarative contract

A `CapabilityManifest` names the capability, lists every permission it needs (network hosts, storage scopes, ui, clock, audit), and declares its actions. The runtime only executes what the manifest declares.

`hardenManifest()` runs after structural validation. It enforces strictness checks that an approver would otherwise have to enforce by eye:

- **Errors** — reasons must be ≥5 words, action descriptions must be ≥5 words, no wildcards in network `hosts` or storage `scope`.
- **Warnings** — every permission's reason should name the action(s) that use it (`permission.reason.no_action_ref` when none are named, `permission.reason.action_ref_incomplete` when only some of N≥2 are named); manifests should not carry stray fields at the top level, inside a permission, or inside an action (`manifest.unknown_field`).

`verifyManifest()` is the one-shot entry point: it runs structural validation and hardening together and returns every error and warning the manifest produces in one call. Broken subtrees from structural failure are skipped during hardening, but the rest of the manifest still gets hardened — a mixed-violation first draft surfaces every fix on the first round-trip.

Source: [`src/capability-manifest.ts`](./src/capability-manifest.ts).

### 2. Permissions — the broker boundary

A capability cannot make a network call, write to storage, render UI, read the clock, or emit audit events except through a *broker* the runtime hands it. Brokers are scoped to the permissions the manifest declared. Anything else throws a `PermissionError` with a structured payload pointing at the exact violation.

This is the line: **the manifest is the only surface area the capability has on the host system.**

Source: [`src/permissions.ts`](./src/permissions.ts).

### 3. Structured errors — every failure has a fix-hint

Every error Writmint throws carries the same shape:

```ts
{
  code: 'permission.network.host_denied',
  where: 'NetworkBroker.request',
  expected: ['core-banking.internal'],
  actual: 'evil.example.com',
  fixHint: 'Add evil.example.com to permission core.transactions.hosts, or route this call through a different permission.',
}
```

An agent reading a failure has a deterministic place to look for what went wrong and what to change.

Source: [`src/errors.ts`](./src/errors.ts).

### 4. Replay — every execution is reproducible

Writmint records execution at the transport seam: every network response, storage read, clock value, and emitted audit event. The recording is enough to replay the capability deterministically against the same inputs. Replays detect divergence in strict order — if the recorded run made calls A → B → C and the replay tries to make A → C, it stops at C with a structured error pointing at the missing B.

Source: [`src/replay.ts`](./src/replay.ts).

### 5. Approval — hash-bound, lifecycle-tracked, audited

A capability moves through a lifecycle: `draft → submitted → approved → active → revoked`. The approval is bound to a SHA-256 hash of the manifest. Modify the manifest by one byte after approval and the runtime refuses to execute. Every transition emits an audit event; sensitive paths declared in the manifest are redacted before they reach the audit sink.

If any action sets `destructive: true`, `approve()` additionally requires a `destructiveApprovedBy` value — silent at `submit()` / `validate()`, surfaces only at approve time as `approval.destructive_required`. For a stricter two-person rule, set `requireDistinctDestructiveApprover: true` on the destructive action(s); `approve()` then rejects identical `approvedBy` and `destructiveApprovedBy` with `approval.destructive.same_approver`. The flag is per-action and hash-bound, so a same-actor approval cannot be done by unflagging post-submit.

Source: [`src/approval.ts`](./src/approval.ts).

---

## The canonical demo

[`fixtures/suspicious-transaction-triage/`](./fixtures/suspicious-transaction-triage/) is the end-to-end demo: an analyst reviewing a flagged transaction, pulling customer and account history, running a sanctions/watchlist check, and writing a decision back to a case-management system. It exercises all five pillars across 24 phases (A–H), including:

- **Phase H — failure-path correctness:** chaos-transport induces a timeout mid-flow. The runtime throws a structured error, the audit trail captures the pre-failure work, and a replay against the recording reproduces the failure deterministically.

830 tests pass across `tests/{unit,integration,property,mcp}`.

---

## Install

```bash
npm install writmint
```

Requires Node ≥ 22.

---

## Run the demo

```bash
git clone https://github.com/razukc/writmint
cd writmint
npm install

npm run demo:smoke      # permission enforcement, ~12 assertions
npm run demo:approval   # approval lifecycle: draft → submitted → approved → revoked
npm run demo:replay     # record a run, then replay it deterministically
npm run demo:e2e        # full end-to-end (phases A–H, including failure-path correctness)
npm run demo            # all four, in order
```

Each script is a single TypeScript file in `fixtures/suspicious-transaction-triage/`. Read them alongside the output — they are the most concrete documentation Writmint has.

---

## Quickstart

```ts
import {
  ApprovalLifecycle,
  MemoryCapabilityStore,
  MemoryAuditSink,
  buildAuditingTransports,
  createPermissionRegistry,
  type CapabilityManifest,
  type HostTransports,
  type NetworkBroker,
  type AuditBroker,
} from 'writmint';

// 1. Declare what the capability is and what it's allowed to touch.
const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: 'example.greet',
  version: '0.1.0',
  title: 'Greet',
  description: 'Fetch a greeting and emit an audit event.',
  permissions: [
    {
      type: 'network',
      id: 'greetings.api',
      hosts: ['greet.example.com'],
      methods: ['GET'],
      reason: 'Used by greet.fetch to read the greeting of the day.',
    },
    {
      type: 'audit',
      id: 'audit.greet',
      reason: 'Used by greet.fetch to record the greeting that was served.',
    },
  ],
  actions: [
    {
      id: 'greet.fetch',
      description: 'Fetch the greeting of the day from upstream API.',
      input: { type: 'object', properties: {} },
      output: { type: 'object', properties: { text: { type: 'string' } } },
      permissions: ['greetings.api', 'audit.greet'],
      handler: 'fetch',
    },
  ],
  implementation: { type: 'module', entry: 'greet.ts' },
};

// 2. Submit, approve (binding to the manifest's SHA-256), activate.
const lifecycle = new ApprovalLifecycle(new MemoryCapabilityStore());
const submitted = lifecycle.submit(manifest);   // throws on hardening errors; surfaces warnings
const approved = lifecycle.approve({
  capabilityId: manifest.id,
  versionHash: submitted.versionHash,            // change one byte → hash mismatch → rejected
  approvedBy: 'reviewer@you.example',
});
const active = lifecycle.activate(manifest.id);

// 3. Wire host transports. In production these hit your real systems.
const sink = new MemoryAuditSink();
const transports: HostTransports = {
  network: {
    async request() {
      return { status: 200, headers: {}, body: { text: 'hello' } };
    },
  },
  storage: { async get() { return null; }, async put() {}, async delete() {}, async list() { return []; } },
  audit: { emit() {} },
  clock: { now: () => Date.now() },
};

// 4. Wrap transports so every brokered call is audited and bound to this approval.
const auditing = buildAuditingTransports({ base: transports, manifest, record: active, sink });

// 5. Get permission-scoped brokers for one action. Calls outside the manifest throw.
const registry = createPermissionRegistry(manifest, auditing);
const scope = registry.forAction('greet.fetch');
const net = scope.cap('greetings.api') as NetworkBroker;
const audit = scope.cap('audit.greet') as AuditBroker;

const res = await net.request({ url: 'https://greet.example.com/today', method: 'GET' });
audit.emit('greet.fetched', { text: (res.body as { text: string }).text });

console.log(sink.events.length, 'audit events captured');
```

For the full picture — including replay, destructive-action gating, redaction, and chaos-transport failure-path correctness — read [`fixtures/suspicious-transaction-triage/`](./fixtures/suspicious-transaction-triage/).

---

## MCP server

For agents driving Writmint through the Model Context Protocol, the package ships an MCP server exposing the same pillars: `validate_manifest`, `submit_manifest`, `approve_manifest`, `hash_manifest`, `record`, `replay`, `audit_events`, `format_error`.

```bash
npm run mcp   # tsx tools/mcp/server.ts
```

Every handler's response follows the same tagged-union shape inside the text body:

```jsonc
// success (envelope.isError unset)
{ "ok": true,  "data":   { /* handler-specific */ } }

// failure (envelope.isError === true)
{ "ok": false, "errors": [ /* StructuredError[] */ ] }
```

`isError` and `text.ok` are redundant by design — callers branch on either channel and reach the same conclusion. A `validate_manifest` rejection carries every structural and hardening violation in `errors[]`, not just the first, so a mixed-violation first-draft manifest gets the full picture in one round-trip.

The `writmint-authoring` Claude Code skill (`~/.claude/skills/writmint-authoring/SKILL.md` in the dogfood environment) is the agent-facing schema reference and recovery-loop guide.

---

## Repository layout

```
src/
  capability-manifest.ts       Pillar 1 — declarative contract + hardenManifest()
  permissions.ts               Pillar 2 — broker boundary, scoped enforcement
  errors.ts                    Pillar 3 — structured errors with fix-hints
  replay.ts                    Pillar 4 — record/replay over the transport seam
  approval.ts                  Pillar 5 — hash-bound approval lifecycle + audit

fixtures/
  suspicious-transaction-triage/   the canonical end-to-end demo
    manifest.ts                    the CapabilityManifest under test
    end-to-end.ts                  full demo, phases A–H (npm run demo:e2e)
    smoke.ts                       permission enforcement (npm run demo:smoke)
    approval-smoke.ts              approval lifecycle (npm run demo:approval)
    replay-smoke.ts                record + replay (npm run demo:replay)
    chaos-transport.ts             fault-injection wrapper used by phase H

tools/
  mcp/                         MCP server exposing the pillars (npm run mcp)
  dogfood/                     PreToolUse hook script + telemetry for dogfood passes

tests/
  unit/                        per-file unit tests
  integration/                 cross-subsystem behavior
  property/                    fast-check property tests
  mcp/                         MCP server contract tests (handler shape, error wrapping)
  dogfood/                     telemetry harness for the Layer 3 PreToolUse hook
```

830 tests across 56 files, all passing.

---

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Writmint targets enterprise environments; the patent grant in Apache-2.0 is intentional.

---

## Status and roadmap

The five pillars, the canonical demo, and the MCP server are all in. Subsequent v0.x releases have tightened the authoring surface based on dogfood feedback from agents writing manifests against the live system:

- **v0.2.x** — manifest hardening rules (wildcard hosts/scopes, reason/description length, reason-references-action warning); replay JSON stability.
- **v0.3.x** — `manifest.unknown_field` warning; opt-in two-person rule on destructive approval (`requireDistinctDestructiveApprover`); `verifyManifest()` combined structural + hardening; `ApprovalError.allErrors` so every batch rejection arrives complete.
- **v0.4.x** — tagged-union envelope on every MCP handler response (`{ok, data}` / `{ok, errors}`); `RuntimeError.allErrors` mirroring the v0.3.1 approval change; vitest 4 / dependency security patch.

What it does not yet ship: stable public API guarantees, broad documentation, additional demos, packaging for non-Node hosts. Those land in v0.x as the API surface settles. See [`CHANGELOG.md`](./CHANGELOG.md) for the full record.

If you are evaluating Writmint for a regulated-ops use case, open an issue — the demo is the best current answer to "is this real?"
