# Writmint

**An issuance authority for AI-authored features.**

Writmint is a TypeScript runtime for shipping features that an AI agent wrote, into a system you don't want to break. A feature defined against Writmint can be validated, reviewed, and executed safely — with full visibility into what it does, what it touches, and what it produced — without trusting the author.

> Status: **v0.1.0 — early.** API surface is stable enough for the demo below, not yet stable enough to depend on. Issues and feedback welcome.

---

## Why this exists

If you let an agent author features that run inside a regulated system — bank ops, healthcare workflows, insurance triage — you need answers to four questions before any feature reaches production, and you need them every time:

1. *What does this feature claim to do?*
2. *What is it allowed to touch?*
3. *Did a human approve this exact version?*
4. *Can we replay what it actually did?*

Writmint is the smallest set of primitives that makes those four questions answerable, automatically, for every feature an agent ships.

---

## The five pillars

Each pillar is one file in `src/`. Together they cover the lifecycle from "agent drafts a feature" to "audit reproduces it six months later."

### 1. Feature Manifest — the declarative contract

A feature is a `FeatureManifest`: a typed object that names the feature, lists every capability it needs, declares its config schema, and describes its actions. The agent authors the manifest first; the runtime only executes what the manifest declares.

```ts
const manifest: FeatureManifest = {
  schemaVersion: 1,
  id: 'ops.fraud.suspicious_transaction_triage',
  version: '0.1.0',
  title: 'Suspicious Transaction Triage',
  capabilities: [
    { type: 'network', id: 'core.transactions',
      hosts: ['core-banking.internal'], methods: ['GET'],
      reason: 'Read the flagged transaction and customer record.' },
    { type: 'network', id: 'cases.write',
      hosts: ['cases.internal'], methods: ['POST'],
      reason: 'Write the analyst decision. Destructive; gated separately.' },
    // ...storage, ui, audit, clock capabilities
  ],
  // ...config schema, actions
};
```

Source: [`src/feature-manifest.ts`](./src/feature-manifest.ts).

### 2. Capabilities — the broker boundary

A feature cannot make a network call, write to storage, render UI, read the clock, or emit audit events except through a *broker* the runtime hands it. Brokers are scoped to the capabilities the manifest declared. A feature that wants to POST to a host it didn't declare gets a `CapabilityError` with a structured payload pointing at the exact violation.

This is the line: **the manifest is the only surface area the feature has on the host system.**

Source: [`src/capabilities.ts`](./src/capabilities.ts).

### 3. Structured errors — every failure has a fix-hint

Every error Writmint throws carries a structured payload:

```ts
{
  code: 'CAPABILITY_HOST_NOT_DECLARED',
  where: 'NetworkBroker.request',
  expected: ['core-banking.internal'],
  actual: 'evil.example.com',
  fixHint: 'Add evil.example.com to capability core.transactions.hosts, or route this call through a different capability.'
}
```

The shape is the same for every error, so an agent reading a failure has a deterministic place to look for what went wrong and what to change. No string-parsing.

Source: [`src/errors.ts`](./src/errors.ts).

### 4. Replay — every execution is reproducible

Writmint records execution at the transport seam: every network response, storage read, clock value, and emitted audit event. The recording is enough to replay the feature deterministically against the same inputs. Replays detect divergence in strict order — if the recorded run made calls A → B → C and the replay tries to make A → C, it stops at C with a structured error pointing at the missing B.

Source: [`src/replay.ts`](./src/replay.ts).

### 5. Approval — hash-bound, lifecycle-tracked, audited

A feature moves through a lifecycle: `draft → submitted → approved → active → revoked`. The approval is bound to a SHA-256 hash of the manifest. Modify the manifest by one byte after approval, the hash no longer matches, and the runtime refuses to execute. Every transition emits an audit event; sensitive paths declared in the manifest are redacted before they reach the audit sink.

Source: [`src/approval.ts`](./src/approval.ts).

---

## The canonical demo

[`fixtures/suspicious-transaction-triage/`](./fixtures/suspicious-transaction-triage/) is the end-to-end demo: an analyst reviewing a flagged transaction, pulling customer and account history, running a sanctions/watchlist check, and writing a decision back to a case-management system. It exercises all five pillars across 24 phases (A–H), including:

- **Phase H — failure-path correctness:** chaos-transport induces a timeout mid-flow. The runtime throws a structured error, the audit trail captures the pre-failure work, and a replay against the recording reproduces the failure deterministically.

737 tests pass across `tests/{unit,integration,property}`.

---

## Install

```bash
npm install writmint
```

Requires Node ≥ 22.

---

## Run the demo

The triage demo exercises every pillar against in-memory transports, so it runs anywhere Node runs — no banking system required.

```bash
git clone https://github.com/razukc/writmint
cd writmint
npm install

npm run demo:smoke      # capability enforcement, ~12 assertions
npm run demo:approval   # approval lifecycle: draft → submitted → approved → revoked
npm run demo:replay     # record a run, then replay it deterministically
npm run demo:e2e        # full end-to-end (phases A–H, including failure-path correctness)
npm run demo            # all four, in order
```

Each script is a single TypeScript file in `fixtures/suspicious-transaction-triage/`. Read them alongside the output — they're the most concrete documentation Writmint has at v0.1.

---

## Quickstart

This is the smallest end-to-end exercise of the five pillars: declare a
manifest, submit it, approve it against its hash, activate it, and execute
an action through capability-scoped brokers with audit and replay attached.

```ts
import {
  ApprovalLifecycle,
  MemoryFeatureStore,
  MemoryAuditSink,
  buildAuditingTransports,
  createFeatureCapabilityRegistry,
  type FeatureManifest,
  type HostTransports,
  type NetworkBroker,
  type AuditBroker,
} from 'writmint';

// 1. Declare what the feature is and what it's allowed to touch.
const manifest: FeatureManifest = {
  schemaVersion: 1,
  id: 'example.greet',
  version: '0.1.0',
  title: 'Greet',
  description: 'Fetch a greeting and emit an audit event.',
  capabilities: [
    {
      type: 'network', id: 'greetings.api',
      hosts: ['greet.example.com'], methods: ['GET'],
      reason: 'Read the greeting of the day.',
    },
    { type: 'audit', id: 'audit.greet', reason: 'Record the greeting.' },
  ],
  actions: [
    {
      id: 'greet.fetch',
      description: 'Fetch the greeting of the day.',
      input: { type: 'object', properties: {} },
      output: { type: 'object', properties: { text: { type: 'string' } } },
      capabilities: ['greetings.api', 'audit.greet'],
    },
  ],
  implementation: { type: 'module', entry: 'greet.ts' },
};

// 2. Submit, approve (binding to the manifest's SHA-256), activate.
const store = new ApprovalLifecycle(new MemoryFeatureStore());
const submitted = store.submit(manifest);
const approved = store.approve({
  featureId: manifest.id,
  versionHash: submitted.versionHash,  // change one byte → hash mismatch → rejected
  approvedBy: 'reviewer@you.example',
});
const active = store.activate(manifest.id);

// 3. Wire host transports. In production these hit your real systems.
const sink = new MemoryAuditSink();
const transports: HostTransports = {
  network: {
    async request() {
      return { status: 200, headers: {}, body: { text: 'hello' } };
    },
  },
  storage: { async get() { return null; }, async put() {}, async delete() {}, async list() { return []; } },
  audit: { emit() {} },          // wrapped below
  clock: { now: () => Date.now() },
};

// 4. Wrap transports so every capability call is audited and bound to this approval.
const auditing = buildAuditingTransports({
  base: transports, manifest, record: active, sink,
});

// 5. Get capability-scoped brokers for one action. Calls outside the manifest throw.
const reg = createFeatureCapabilityRegistry(manifest, auditing);
const scope = reg.forAction('greet.fetch');
const net = scope.cap('greetings.api') as NetworkBroker;
const auditBroker = scope.cap('audit.greet') as AuditBroker;

const res = await net.request({ url: 'https://greet.example.com/today', method: 'GET' });
auditBroker.emit('greet.fetched', { text: (res.body as { text: string }).text });

console.log(sink.events.length, 'audit events captured');
```

For a full demo — including replay, destructive-action gating, redaction,
and chaos-transport failure-path correctness — read
[`fixtures/suspicious-transaction-triage/`](./fixtures/suspicious-transaction-triage/).

---

## Repository layout

```
src/
  feature-manifest.ts          Pillar 1 — the declarative contract
  capabilities.ts              Pillar 2 — broker boundary, scoped enforcement
  errors.ts                    Pillar 3 — structured errors with fix-hints
  replay.ts                    Pillar 4 — record/replay over the transport seam
  approval.ts                  Pillar 5 — hash-bound approval lifecycle + audit

  runtime.ts                   internal: feature/plugin runtime the pillars stand on
  action-engine.ts             internal: action dispatch, retries, timeouts
  event-bus.ts                 internal: typed pub/sub
  execution-recorder.ts        internal: in-process execution traces
  plugin-loader.ts             internal: filesystem-based plugin discovery
  plugin-registry.ts           internal: plugin lifecycle (register, dispose, hot-swap)
  runtime-context.ts           internal: per-feature context passed to handlers
  screen-registry.ts           internal: UI screen registration surface
  service-registry.ts          internal: service-locator registry
  ui-bridge.ts                 internal: UI-provider abstraction (terminal, web, etc.)
  performance.ts               internal: timing/instrumentation primitives
  test-utils.ts                internal: in-tree test helpers
  types.ts                     internal: shared types (Logger, ConsoleLogger, etc.)
  index.ts, index.browser.ts   public entry points (Node and browser builds)
  plugins/                     internal: bundled plugins (Config, FeatureFlag)

fixtures/
  suspicious-transaction-triage/   the canonical end-to-end demo
    manifest.ts                    the FeatureManifest under test
    end-to-end.ts                  full demo, phases A–H (npm run demo:e2e)
    smoke.ts                       capability enforcement only (npm run demo:smoke)
    approval-smoke.ts              approval lifecycle (npm run demo:approval)
    replay-smoke.ts                record + replay (npm run demo:replay)
    chaos-transport.ts             fault-injection wrapper used by phase H

tests/
  unit/                        per-file unit tests
  integration/                 cross-subsystem behavior
  property/                    fast-check property tests (12 invariants)
```

737 tests across 47 files, all passing.

---

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Writmint targets enterprise environments; the patent grant in Apache-2.0 is intentional.

---

## Status and roadmap

v0.1 ships the five pillars and the triage demo. What it does not yet ship: stable public API guarantees, broad documentation, additional demos, packaging for non-Node hosts. Those land in v0.x as the API surface settles.

If you are evaluating Writmint for a regulated-ops use case, open an issue — the demo is the best current answer to "is this real?"
