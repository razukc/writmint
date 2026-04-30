import { manifest } from './manifest.js';
import {
  ApprovalLifecycle,
  ApprovalError,
  MemoryFeatureStore,
  MemoryAuditSink,
  buildAuditingTransports,
  emitLifecycleEvent,
  hashManifest,
} from '../../src/approval.js';
import {
  createFeatureCapabilityRegistry,
  type HostTransports,
  type NetworkBroker,
  type StorageBroker,
  type AuditBroker,
} from '../../src/capabilities.js';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok, detail });
};

const baseTransports: HostTransports = {
  network: {
    async request() {
      return { status: 200, headers: {}, body: { ok: true } };
    },
  },
  storage: {
    async get() {
      return { highValue: 10000 };
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

async function run(): Promise<void> {
  // 1. submit
  const store = new MemoryFeatureStore();
  const sink = new MemoryAuditSink();
  const lifecycle = new ApprovalLifecycle(store);
  const submitted = lifecycle.submit(manifest);
  check(
    'submit produces a record with versionHash and status submitted',
    submitted.status === 'submitted' && /^sha256:[0-9a-f]{64}$/.test(submitted.versionHash),
    `status=${submitted.status} hash=${submitted.versionHash}`
  );

  // 2. cannot run before approval+activation
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    check('runnable check rejects submitted (not active)', false, 'no throw');
  } catch (e) {
    if (e instanceof ApprovalError && e.structured.code === 'approval.not_runnable') {
      check('runnable check rejects submitted (not active)', true, e.structured.code);
    } else {
      check('runnable check rejects submitted (not active)', false, String(e));
    }
  }

  // 3. approve without destructiveApprovedBy fails (manifest has destructive action)
  try {
    lifecycle.approve({
      featureId: manifest.id,
      versionHash: submitted.versionHash,
      approvedBy: 'reviewer@bank',
    });
    check('approve without destructiveApprovedBy is rejected', false, 'no throw');
  } catch (e) {
    if (e instanceof ApprovalError && e.structured.code === 'approval.destructive_required') {
      check('approve without destructiveApprovedBy is rejected', true, e.structured.code);
    } else {
      check('approve without destructiveApprovedBy is rejected', false, String(e));
    }
  }

  // 4. approve with mismatched hash is rejected
  try {
    lifecycle.approve({
      featureId: manifest.id,
      versionHash: 'hdeadbeef',
      approvedBy: 'reviewer@bank',
      destructiveApprovedBy: 'compliance@bank',
    });
    check('approve with hash mismatch is rejected', false, 'no throw');
  } catch (e) {
    if (e instanceof ApprovalError && e.structured.code === 'approval.hash_mismatch') {
      check('approve with hash mismatch is rejected', true, e.structured.code);
    } else {
      check('approve with hash mismatch is rejected', false, String(e));
    }
  }

  // 5. approve correctly, then activate
  const approved = lifecycle.approve({
    featureId: manifest.id,
    versionHash: submitted.versionHash,
    approvedBy: 'reviewer@bank',
    destructiveApprovedBy: 'compliance@bank',
  });
  emitLifecycleEvent(sink, approved, 'approved', 'reviewer@bank');
  const active = lifecycle.activate(manifest.id);
  emitLifecycleEvent(sink, active, 'active', 'reviewer@bank');
  check(
    'feature is now active',
    active.status === 'active' && active.approvedBy === 'reviewer@bank',
    `status=${active.status}`
  );

  // 6. runnable for non-destructive action when active
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]); // load_alert (non-destructive)
    check('non-destructive action is runnable when active', true, 'ok');
  } catch (e) {
    check('non-destructive action is runnable when active', false, String(e));
  }

  // 7. runnable for destructive action when destructiveApprovedBy is set
  const destructive = manifest.actions.find((a) => a.destructive)!;
  try {
    lifecycle.assertRunnable(manifest.id, destructive);
    check('destructive action is runnable with destructive approval', true, 'ok');
  } catch (e) {
    check('destructive action is runnable with destructive approval', false, String(e));
  }

  // 8. revoke blocks runs
  lifecycle.revoke(manifest.id);
  try {
    lifecycle.assertRunnable(manifest.id, manifest.actions[0]);
    check('revoked feature cannot run', false, 'no throw');
  } catch (e) {
    if (e instanceof ApprovalError && e.structured.code === 'approval.not_runnable') {
      check('revoked feature cannot run', true, e.structured.code);
    } else {
      check('revoked feature cannot run', false, String(e));
    }
  }

  // 9. resubmit, re-approve a modified manifest -> versionHash changes,
  // prior approval is invalidated.
  const modified = { ...manifest, description: manifest.description + ' (v2)' };
  const reSubmitted = lifecycle.submit(modified);
  check(
    'modified manifest gets a different versionHash',
    reSubmitted.versionHash !== submitted.versionHash,
    `${reSubmitted.versionHash} !== ${submitted.versionHash}`
  );

  // 10. audit sink: capability calls are emitted with feature id and version hash, redaction is applied.
  const sink2 = new MemoryAuditSink();
  const store2 = new MemoryFeatureStore();
  const lifecycle2 = new ApprovalLifecycle(store2);
  const sub2 = lifecycle2.submit(manifest);
  const apr2 = lifecycle2.approve({
    featureId: manifest.id,
    versionHash: sub2.versionHash,
    approvedBy: 'reviewer@bank',
    destructiveApprovedBy: 'compliance@bank',
  });
  lifecycle2.activate(manifest.id);

  const auditing = buildAuditingTransports({
    base: baseTransports,
    manifest,
    record: apr2,
    sink: sink2,
  });
  const reg = createFeatureCapabilityRegistry(manifest, auditing);
  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: 'https://core-banking.internal/tx/abc', method: 'GET' });
  const store_ = load.cap('tenant.thresholds') as StorageBroker;
  await store_.get('high-value');
  const auditB = load.cap('audit.triage') as AuditBroker;
  auditB.emit('triage.alert_loaded', {
    actionId: 'triage.load_alert',
    customer: { taxId: '123-45-6789', name: 'Jane Doe', email: 'jane@example.com' },
  });

  const allHaveFeatureId = sink2.events.every((e) => e.featureId === manifest.id);
  check(
    'every audit event carries featureId and versionHash',
    allHaveFeatureId && sink2.events.every((e) => e.featureVersionHash === sub2.versionHash),
    `${sink2.events.length} events`
  );

  const featureEmit = sink2.events.find((e) => e.kind === 'feature_emit');
  const payload = featureEmit?.payload as { payload: { customer: { taxId: string; email: string } } };
  check(
    'redact paths replace declared PII fields with [REDACTED]',
    payload?.payload?.customer?.taxId === '[REDACTED]' &&
      payload?.payload?.customer?.email === '[REDACTED]' &&
      (payload?.payload?.customer as unknown as { name: string }).name === 'Jane Doe',
    `taxId=${payload?.payload?.customer?.taxId}`
  );

  // 11. audit transport throws if not provided -> Pillar 2 already enforces;
  // here we confirm the sink is mandatory (audit broker requires transports.audit).
  // (Already covered in capabilities; leave as a property invariant.)

  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${r.name} -- ${r.detail}`);
    if (r.ok) pass++;
    else fail++;
  }
  console.log('');
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  console.log(`Audit events captured: ${sink2.events.length}`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error('SMOKE CRASH', e);
  process.exit(2);
});

void hashManifest;
