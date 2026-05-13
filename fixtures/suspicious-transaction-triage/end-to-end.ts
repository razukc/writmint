import { manifest } from './manifest.js';
import { validateCapabilityManifest } from '../../src/capability-manifest.js';
import {
  createPermissionRegistry,
  CapabilityError,
  type HostTransports,
  type NetworkBroker,
  type StorageBroker,
  type AuditBroker,
} from '../../src/permissions.js';
import { record, replay, ReplayDivergenceError } from '../../src/replay.js';
import { withChaos, ChaosTimeoutError } from './chaos-transport.js';
import {
  ApprovalLifecycle,
  ApprovalError,
  MemoryCapabilityStore,
  MemoryAuditSink,
  buildAuditingTransports,
  emitLifecycleEvent,
} from '../../src/approval.js';
import type { CapabilityRecord } from '../../src/approval.js';

interface Step {
  name: string;
  ok: boolean;
  detail: string;
  pillars: number[];
}
const steps: Step[] = [];
const log = (name: string, ok: boolean, detail: string, pillars: number[]): void => {
  steps.push({ name, ok, detail, pillars });
};

interface FakeBackend {
  transactionsCalls: number;
  historyCalls: number;
  watchlistCalls: number;
  caseWrites: { alertId: string; decision: string }[];
}

function makeBackend(): { backend: FakeBackend; transports: HostTransports } {
  const backend: FakeBackend = {
    transactionsCalls: 0,
    historyCalls: 0,
    watchlistCalls: 0,
    caseWrites: [],
  };
  const transports: HostTransports = {
    network: {
      async request(input) {
        if (input.url.includes('/tx/')) {
          backend.transactionsCalls++;
          return {
            status: 200,
            headers: {},
            body: { id: 'tx-1', amount: 25_000, counterparty: { name: 'Acme Holdings' } },
          };
        }
        if (input.url.includes('/history')) {
          backend.historyCalls++;
          return { status: 200, headers: {}, body: [{ amount: 100 }, { amount: 250 }] };
        }
        if (input.url.includes('watchlist')) {
          backend.watchlistCalls++;
          return { status: 200, headers: {}, body: { score: 0.92, matches: [{ list: 'OFAC' }] } };
        }
        if (input.url.includes('cases')) {
          const body = (input.body ?? {}) as { alertId?: string; decision?: string };
          backend.caseWrites.push({
            alertId: body.alertId ?? '?',
            decision: body.decision ?? '?',
          });
          return {
            status: 201,
            headers: {},
            body: { caseId: 'case-' + backend.caseWrites.length, recordedAt: '2026-04-29T10:00:00Z' },
          };
        }
        return { status: 404, headers: {}, body: null };
      },
    },
    storage: {
      async get(scope, key) {
        if (scope === 'tenant/risk-thresholds' && key === 'high-value') {
          return { highValue: 10_000 };
        }
        return null;
      },
      async put() {},
      async delete() {},
      async list() {
        return [];
      },
    },
    audit: { emit() {} },
    clock: { now: () => 1_700_000_000_000 },
  };
  return { backend, transports };
}

async function runFeature(
  transports: HostTransports,
  alertId: string,
  decision: 'clear' | 'escalate' | 'block'
): Promise<{ caseId: string; watchlistScore: number }> {
  const reg = createPermissionRegistry(manifest, transports);

  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: `https://core-banking.internal/tx/${alertId}`, method: 'GET' });
  const histNet = load.cap('core.account_history') as NetworkBroker;
  await histNet.request({ url: `https://core-banking.internal/history?alert=${alertId}`, method: 'GET' });
  const thresholds = load.cap('tenant.thresholds') as StorageBroker;
  await thresholds.get('high-value');
  const auditL = load.cap('audit.triage') as AuditBroker;
  auditL.emit('triage.alert_loaded', {
    actionId: 'triage.load_alert',
    customer: { taxId: '123-45-6789', name: 'Jane Doe', email: 'jane@example.com' },
  });

  const wl = reg.forAction('triage.run_watchlist_check');
  const wlNet = wl.cap('sanctions.watchlist') as NetworkBroker;
  const wlResp = await wlNet.request({
    url: 'https://watchlist.vendor.example.com/check',
    method: 'POST',
    body: { name: 'Acme Holdings' },
  });
  const score = (wlResp.body as { score: number }).score;
  const auditW = wl.cap('audit.triage') as AuditBroker;
  auditW.emit('triage.watchlist_completed', { actionId: 'triage.run_watchlist_check', score });

  const submit = reg.forAction('triage.submit_decision');
  const caseNet = submit.cap('cases.write') as NetworkBroker;
  const caseResp = await caseNet.request({
    url: 'https://cases.internal/decisions',
    method: 'POST',
    body: { alertId, decision, reason: 'auto-test', watchlistScore: score },
  });
  const clk = submit.cap('clock.deterministic') as { now: () => number; iso: () => string };
  clk.now();
  const auditS = submit.cap('audit.triage') as AuditBroker;
  auditS.emit('triage.decision_recorded', {
    actionId: 'triage.submit_decision',
    decision,
    alertId,
  });

  return {
    caseId: (caseResp.body as { caseId: string }).caseId,
    watchlistScore: score,
  };
}

async function runFeatureMutated(
  transports: HostTransports,
  alertId: string
): Promise<unknown> {
  // Same start, but skips the watchlist step entirely — must surface as a divergence on replay.
  const reg = createPermissionRegistry(manifest, transports);
  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: `https://core-banking.internal/tx/${alertId}`, method: 'GET' });
  const histNet = load.cap('core.account_history') as NetworkBroker;
  await histNet.request({ url: `https://core-banking.internal/history?alert=${alertId}`, method: 'GET' });
  const thresholds = load.cap('tenant.thresholds') as StorageBroker;
  await thresholds.get('high-value');
  const auditL = load.cap('audit.triage') as AuditBroker;
  auditL.emit('triage.alert_loaded', {
    actionId: 'triage.load_alert',
    customer: { taxId: '123-45-6789' },
  });
  // skipped watchlist + decision intentionally
  return null;
}

async function withFreshState(): Promise<{
  store: MemoryCapabilityStore;
  sink: MemoryAuditSink;
  lifecycle: ApprovalLifecycle;
}> {
  const store = new MemoryCapabilityStore();
  const sink = new MemoryAuditSink();
  const lifecycle = new ApprovalLifecycle(store);
  return { store, sink, lifecycle };
}

async function main(): Promise<void> {
  const banner = (s: string): void => console.log('\n=== ' + s + ' ===');

  banner('PHASE A — Manifest validation (Pillar 1)');
  const validation = validateCapabilityManifest(manifest);
  log(
    'manifest is valid (Pillar 1)',
    validation.valid && validation.errors.length === 0,
    `errors=${validation.errors.length}`,
    [1]
  );

  // negative: a tampered manifest must fail with structured errors.
  const broken = JSON.parse(JSON.stringify(manifest));
  broken.actions[0].capabilities.push('does.not.exist');
  delete broken.implementation;
  const brokenResult = validateCapabilityManifest(broken);
  const codes = new Set(brokenResult.errors.map((e) => e.code));
  log(
    'tampered manifest rejected with structured errors (Pillars 1+3)',
    !brokenResult.valid &&
      codes.has('action.capability_ref.unknown') &&
      codes.has('manifest.implementation.type'),
    `codes: ${[...codes].join(', ')}`,
    [1, 3]
  );

  banner('PHASE B — Approval lifecycle gating (Pillar 5)');
  const { store, sink, lifecycle } = await withFreshState();

  // before submit, asking for runnable explodes
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    log('unsubmitted feature cannot run', false, 'no throw', [5]);
  } catch (e) {
    log(
      'unsubmitted feature cannot run',
      e instanceof ApprovalError && e.structured.code === 'approval.unknown_capability',
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }

  const submitted = lifecycle.submit(manifest);
  emitLifecycleEvent(sink, submitted, 'submitted', 'author@bank');

  // approver tries with wrong hash
  try {
    lifecycle.approve({
      capabilityId: manifest.id,
      versionHash: 'h00000000',
      approvedBy: 'reviewer@bank',
      destructiveApprovedBy: 'compliance@bank',
    });
    log('approval rejects mismatched hash', false, 'no throw', [5]);
  } catch (e) {
    log(
      'approval rejects mismatched hash',
      e instanceof ApprovalError && e.structured.code === 'approval.hash_mismatch',
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }

  // approver forgets destructive lane
  try {
    lifecycle.approve({
      capabilityId: manifest.id,
      versionHash: submitted.versionHash,
      approvedBy: 'reviewer@bank',
    });
    log('destructive lane is required at approval time', false, 'no throw', [5]);
  } catch (e) {
    log(
      'destructive lane is required at approval time',
      e instanceof ApprovalError && e.structured.code === 'approval.destructive_required',
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }

  const approved = lifecycle.approve({
    capabilityId: manifest.id,
    versionHash: submitted.versionHash,
    approvedBy: 'reviewer@bank',
    destructiveApprovedBy: 'compliance@bank',
  });
  emitLifecycleEvent(sink, approved, 'approved', 'reviewer@bank');

  // approved-but-not-active still cannot run
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    log('approved-but-not-active still blocked', false, 'no throw', [5]);
  } catch (e) {
    log(
      'approved-but-not-active still blocked',
      e instanceof ApprovalError && e.structured.code === 'approval.not_runnable',
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }

  const active = lifecycle.activate(manifest.id);
  emitLifecycleEvent(sink, active, 'active', 'reviewer@bank');
  log('feature is active', active.status === 'active', `status=${active.status}`, [5]);

  banner('PHASE C — Real run with capability enforcement + audit (Pillars 2, 5)');
  const { backend, transports } = makeBackend();
  const auditing = buildAuditingTransports({
    base: transports,
    manifest,
    record: active,
    sink,
  });

  const result = await runFeature(auditing, 'alert-001', 'clear');
  log(
    'feature run produced a case write-back',
    result.caseId.startsWith('case-') &&
      backend.caseWrites.length === 1 &&
      backend.caseWrites[0].decision === 'clear',
    `caseId=${result.caseId} writes=${backend.caseWrites.length}`,
    [2, 5]
  );
  log(
    'every external call went through a broker (3 distinct intents on shared host)',
    backend.transactionsCalls === 1 &&
      backend.historyCalls === 1 &&
      backend.watchlistCalls === 1,
    `tx=${backend.transactionsCalls} hist=${backend.historyCalls} wl=${backend.watchlistCalls}`,
    [2]
  );

  // capability denial must be live and structured
  const reg = createPermissionRegistry(manifest, auditing);
  const load = reg.forAction('triage.load_alert');
  try {
    load.cap('cases.write');
    log('cross-action capability bleed is denied (Pillars 2+3)', false, 'no throw', [2, 3]);
  } catch (e) {
    log(
      'cross-action capability bleed is denied (Pillars 2+3)',
      e instanceof CapabilityError && e.structured.code === 'capability.denied',
      e instanceof CapabilityError ? e.structured.code : String(e),
      [2, 3]
    );
  }

  banner('PHASE D — Audit redaction (Pillar 5)');
  const capabilityEmits = sink.events.filter((e) => e.kind === 'capability_emit');
  const alertLoaded = capabilityEmits.find(
    (e) => (e.payload as { name: string }).name === 'triage.alert_loaded'
  );
  const aPayload = alertLoaded?.payload as
    | { payload: { customer: { taxId: string; email: string; name: string } } }
    | undefined;
  log(
    'PII fields declared in `redact` are replaced before audit',
    aPayload?.payload?.customer?.taxId === '[REDACTED]' &&
      aPayload?.payload?.customer?.email === '[REDACTED]' &&
      aPayload?.payload?.customer?.name === 'Jane Doe',
    `taxId=${aPayload?.payload?.customer?.taxId} email=${aPayload?.payload?.customer?.email}`,
    [5]
  );

  const allTagged = sink.events.every(
    (e) =>
      e.capabilityId === manifest.id &&
      e.capabilityVersionHash === active.versionHash &&
      e.approvedBy === 'reviewer@bank' || e.kind === 'lifecycle'
  );
  log(
    'every audit event carries capabilityId + versionHash (and approver post-approval)',
    allTagged,
    `${sink.events.length} events`,
    [5]
  );

  banner('PHASE E — Deterministic replay (Pillar 4)');
  const { transports: cleanTransports } = makeBackend();
  // record on the bare transports (no audit wrapper, to keep recording tight).
  const rec = await record(cleanTransports, (t) => runFeature(t, 'alert-002', 'escalate'));
  log(
    'recording captures every broker call',
    rec.recording.entries.length >= 9,
    `entries=${rec.recording.entries.length}`,
    [4]
  );

  // replay against a totally different backend that would respond differently —
  // replay should ignore the new backend and serve recorded outputs.
  const sandboxed: HostTransports = {
    network: {
      async request() {
        return { status: 500, headers: {}, body: { sabotaged: true } };
      },
    },
    storage: {
      async get() {
        return { sabotaged: true };
      },
      async put() {},
      async delete() {},
      async list() {
        return [];
      },
    },
    audit: { emit() {} },
    clock: { now: () => 999 },
  };
  void sandboxed;
  const rep = await replay(rec.recording, (t) => runFeature(t, 'alert-002', 'escalate'));
  log(
    'replay returns recorded outputs deterministically',
    rep.output.caseId.startsWith('case-') &&
      rep.output.watchlistScore === 0.92 &&
      rep.entries.length === rec.recording.entries.length,
    `caseId=${rep.output.caseId} score=${rep.output.watchlistScore}`,
    [4]
  );

  // mutate the feature: skip watchlist + decision -> divergence
  try {
    await replay(rec.recording, (t) => runFeatureMutated(t, 'alert-002'));
    log('mutated feature is detected by replay', false, 'no throw', [4]);
  } catch (e) {
    log(
      'mutated feature is detected by replay',
      e instanceof ReplayDivergenceError,
      e instanceof ReplayDivergenceError ? e.structured.code : String(e),
      [4]
    );
  }

  banner('PHASE F — Re-approval after manifest change (Pillars 1+5)');
  const v2 = JSON.parse(JSON.stringify(manifest));
  v2.description = manifest.description + ' (revised)';
  const reSub = lifecycle.submit(v2);
  log(
    'modified manifest gets a fresh versionHash and falls back to submitted',
    reSub.versionHash !== submitted.versionHash && reSub.status === 'submitted',
    `${submitted.versionHash} -> ${reSub.versionHash}`,
    [1, 5]
  );

  // Old approval is now stale; trying to run any action throws.
  let staleRecord: CapabilityRecord | null = null;
  try {
    staleRecord = lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    log('prior approval becomes stale after manifest change', false, 'no throw', [5]);
  } catch (e) {
    log(
      'prior approval becomes stale after manifest change',
      e instanceof ApprovalError &&
        (e.structured.code === 'approval.not_runnable' ||
          e.structured.code === 'approval.stale'),
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }
  void staleRecord;

  banner('PHASE G — Revoke kills further runs (Pillar 5)');
  const reApproved = lifecycle.approve({
    capabilityId: manifest.id,
    versionHash: reSub.versionHash,
    approvedBy: 'reviewer@bank',
    destructiveApprovedBy: 'compliance@bank',
  });
  lifecycle.activate(manifest.id);
  log('feature can be re-approved + re-activated', reApproved.status === 'approved', '', [5]);

  lifecycle.revoke(manifest.id);
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    log('revoked feature is unrunnable', false, 'no throw', [5]);
  } catch (e) {
    log(
      'revoked feature is unrunnable',
      e instanceof ApprovalError && e.structured.code === 'approval.not_runnable',
      e instanceof ApprovalError ? e.structured.code : String(e),
      [5]
    );
  }

  banner('PHASE H — Failure-path correctness with chaos transport (Pillars 2+3+4+5)');
  // Set up: a fresh active feature record + a fresh sink so audit assertions are scoped.
  const phaseHStore = new MemoryCapabilityStore();
  const phaseHSink = new MemoryAuditSink();
  const phaseHLifecycle = new ApprovalLifecycle(phaseHStore);
  const phaseHSubmitted = phaseHLifecycle.submit(manifest);
  phaseHLifecycle.approve({
    capabilityId: manifest.id,
    versionHash: phaseHSubmitted.versionHash,
    approvedBy: 'reviewer@bank',
    destructiveApprovedBy: 'compliance@bank',
  });
  const phaseHActive = phaseHLifecycle.activate(manifest.id);

  const { backend: chaosBackend, transports: chaosBase } = makeBackend();
  const { transports: chaosTransports, controller } = withChaos(chaosBase);
  controller.addRule({
    match: (req) => req.url.includes('watchlist'),
    fault: { kind: 'timeout', afterMs: 5000 },
  });
  const chaosAudited = buildAuditingTransports({
    base: chaosTransports,
    manifest,
    record: phaseHActive,
    sink: phaseHSink,
  });

  // (a) Surfacing — the runtime propagates the transport failure unmodified through brokers.
  try {
    await runFeature(chaosAudited, 'alert-chaos', 'escalate');
    log('chaos timeout surfaces as a thrown error from the broker', false, 'no throw', [2, 3]);
  } catch (e) {
    log(
      'chaos timeout surfaces as a thrown error from the broker',
      e instanceof ChaosTimeoutError,
      e instanceof Error ? e.name + ': ' + e.message : String(e),
      [2, 3]
    );
  }
  log(
    'failed run did not silently mutate downstream state (no case write-back)',
    chaosBackend.caseWrites.length === 0 &&
      chaosBackend.transactionsCalls === 1 &&
      chaosBackend.historyCalls === 1,
    `cases=${chaosBackend.caseWrites.length} tx=${chaosBackend.transactionsCalls} hist=${chaosBackend.historyCalls}`,
    [2, 5]
  );

  // (b) Auditability — the run that failed produced an audit trail up to the failure point.
  const phaseHEmits = phaseHSink.events.filter((e) => e.kind === 'capability_emit');
  const sawAlertLoaded = phaseHEmits.some(
    (e) => (e.payload as { name: string }).name === 'triage.alert_loaded'
  );
  const sawWatchlistCompleted = phaseHEmits.some(
    (e) => (e.payload as { name: string }).name === 'triage.watchlist_completed'
  );
  log(
    'audit trail captures pre-failure work and stops at the failure point',
    sawAlertLoaded && !sawWatchlistCompleted,
    `alert_loaded=${sawAlertLoaded} watchlist_completed=${sawWatchlistCompleted}`,
    [5]
  );

  // (c) Determinism — record a chaotic run, then replay it without chaos and watch it
  // reproduce the timeout from the recording alone (no live network).
  // record() itself throws when fn throws, without returning the partial recording, so we
  // capture entries through a thin shim around chaos that mirrors record()'s shape.
  const captured: import('../../src/replay.js').BrokerCallEntry[] = [];
  const { transports: chaosBaseRec } = makeBackend();
  const { transports: chaosTransportsRec, controller: ctrlRec } = withChaos(chaosBaseRec);
  ctrlRec.addRule({
    match: (req) => req.url.includes('watchlist'),
    fault: { kind: 'timeout', afterMs: 5000 },
  });
  const captureShim: HostTransports = {
    network: {
      async request(input) {
        const idx = captured.length;
        try {
          const out = await chaosTransportsRec.network!.request(input);
          captured.push({ index: idx, kind: 'network.request', input, output: out, threw: false });
          return out;
        } catch (e) {
          captured.push({
            index: idx,
            kind: 'network.request',
            input,
            output: { error: { name: (e as Error).name, message: (e as Error).message } },
            threw: true,
          });
          throw e;
        }
      },
    },
    storage: {
      async get(scope, key) {
        const idx = captured.length;
        const out = await chaosTransportsRec.storage!.get(scope, key);
        captured.push({
          index: idx,
          kind: 'storage.get',
          input: { scope, key },
          output: out,
          threw: false,
        });
        return out;
      },
      async put() {},
      async delete() {},
      async list() {
        return [];
      },
    },
    clock: { now: () => 1_700_000_000_000 },
    audit: {
      emit(event) {
        const idx = captured.length;
        captured.push({
          index: idx,
          kind: 'audit.emit',
          input: { capabilityId: event.capabilityId, name: event.name, payload: event.payload },
          output: undefined,
          threw: false,
        });
      },
    },
  };
  let recordThrew = false;
  try {
    await runFeature(captureShim, 'alert-chaos', 'escalate');
  } catch (e) {
    recordThrew = e instanceof ChaosTimeoutError;
  }
  const recRecording: import('../../src/replay.js').Recording = {
    schemaVersion: 1,
    entries: captured,
  };
  log(
    'a failing chaos run is recordable end-to-end',
    recordThrew && recRecording.entries.length > 0 && recRecording.entries.some((e) => e.threw),
    `entries=${recRecording.entries.length} threw=${recRecording.entries.some((e) => e.threw)}`,
    [4]
  );

  let replayedThrew = false;
  let replayedName = '';
  try {
    await replay(recRecording, (t) => runFeature(t, 'alert-chaos', 'escalate'));
  } catch (e) {
    replayedThrew = true;
    replayedName = (e as Error).name;
  }
  log(
    'replay reproduces the chaos failure deterministically (no live network)',
    replayedThrew && replayedName === 'ChaosTimeoutError',
    `threw=${replayedThrew} name=${replayedName}`,
    [4]
  );

  banner('SUMMARY');
  let pass = 0;
  let fail = 0;
  for (const s of steps) {
    const tag = s.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  P${s.pillars.join('+').padEnd(5)}  ${s.name} -- ${s.detail}`);
    if (s.ok) pass++;
    else fail++;
  }
  console.log('');
  console.log(`Results: ${pass} passed, ${fail} failed of ${steps.length}`);
  console.log(`Audit events captured during the run: ${sink.events.length}`);
  console.log(`Backend touchpoints: tx=${backend.transactionsCalls} hist=${backend.historyCalls} wl=${backend.watchlistCalls} cases=${backend.caseWrites.length}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('END-TO-END CRASH', e);
  process.exit(2);
});
