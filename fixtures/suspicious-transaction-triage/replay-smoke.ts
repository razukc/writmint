import { manifest } from './manifest.js';
import {
  createPermissionRegistry,
  type HostTransports,
  type NetworkBroker,
  type StorageBroker,
  type AuditBroker,
} from '../../src/permissions.js';
import {
  record,
  replay,
  ReplayDivergenceError,
} from '../../src/replay.js';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

const baseTransports: HostTransports = {
  network: {
    async request(input) {
      if (input.url.includes('/tx/')) {
        return { status: 200, headers: {}, body: { id: 'tx-1', amount: 1234 } };
      }
      if (input.url.includes('/history')) {
        return { status: 200, headers: {}, body: [{ id: 'h1' }, { id: 'h2' }] };
      }
      if (input.url.includes('watchlist')) {
        return { status: 200, headers: {}, body: { score: 0.81, matches: [] } };
      }
      if (input.url.includes('cases')) {
        return {
          status: 201,
          headers: {},
          body: { caseId: 'case-1', recordedAt: '2026-04-29T10:00:00Z' },
        };
      }
      return { status: 200, headers: {}, body: null };
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
  audit: {
    emit() {},
  },
  clock: {
    now: () => 1_700_000_000_000,
  },
};

async function runFeatureV1(transports: HostTransports): Promise<{ decision: string }> {
  const reg = createPermissionRegistry(manifest, transports);

  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: 'https://core-banking.internal/tx/abc', method: 'GET' });
  const histNet = load.cap('core.account_history') as NetworkBroker;
  await histNet.request({ url: 'https://core-banking.internal/history?cust=c1', method: 'GET' });
  const store = load.cap('tenant.thresholds') as StorageBroker;
  await store.get('high-value');
  const auditL = load.cap('audit.triage') as AuditBroker;
  auditL.emit('triage.alert_loaded', { alertId: 'abc' });

  const wl = reg.forAction('triage.run_watchlist_check');
  const wlNet = wl.cap('sanctions.watchlist') as NetworkBroker;
  await wlNet.request({
    url: 'https://watchlist.vendor.example.com/check',
    method: 'POST',
    body: { name: 'Acme' },
  });
  const auditW = wl.cap('audit.triage') as AuditBroker;
  auditW.emit('triage.watchlist_completed', { score: 0.81 });

  const sub = reg.forAction('triage.submit_decision');
  const caseNet = sub.cap('cases.write') as NetworkBroker;
  await caseNet.request({
    url: 'https://cases.internal/decisions',
    method: 'POST',
    body: { alertId: 'abc', decision: 'clear' },
  });
  const clk = sub.cap('clock.deterministic') as { now: () => number; iso: () => string };
  clk.now();
  const auditS = sub.cap('audit.triage') as AuditBroker;
  auditS.emit('triage.decision_recorded', { decision: 'clear' });

  return { decision: 'clear' };
}

async function runFeatureV2_extraCall(transports: HostTransports): Promise<{ decision: string }> {
  // Replays v1 fully, then makes one more call past the end of the recording.
  const result = await runFeatureV1(transports);
  const reg = createPermissionRegistry(manifest, transports);
  const sub = reg.forAction('triage.submit_decision');
  const auditX = sub.cap('audit.triage') as AuditBroker;
  auditX.emit('triage.extra_event', { note: 'beyond-recording' });
  return result;
}

async function runFeatureV2_inputDrift(transports: HostTransports): Promise<{ decision: string }> {
  const reg = createPermissionRegistry(manifest, transports);
  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: 'https://core-banking.internal/tx/DIFFERENT', method: 'GET' });
  return { decision: 'clear' };
}

async function runFeatureV2_fewerCalls(transports: HostTransports): Promise<{ decision: string }> {
  const reg = createPermissionRegistry(manifest, transports);
  const load = reg.forAction('triage.load_alert');
  const txNet = load.cap('core.transactions') as NetworkBroker;
  await txNet.request({ url: 'https://core-banking.internal/tx/abc', method: 'GET' });
  return { decision: 'clear' };
}

async function run(): Promise<void> {
  // 1. Record full v1.
  const rec = await record(baseTransports, (t) => runFeatureV1(t));
  check(
    'record captures every broker call',
    rec.recording.entries.length >= 9,
    `recorded ${rec.recording.entries.length} entries`
  );
  check(
    'recording includes network, storage, audit, and clock kinds',
    new Set(rec.recording.entries.map((e) => e.kind)).size >= 4,
    `kinds: ${[...new Set(rec.recording.entries.map((e) => e.kind))].join(', ')}`
  );

  // 2. Replay identical v1 succeeds and consumes all entries.
  try {
    const rep = await replay(rec.recording, (t) => runFeatureV1(t));
    check(
      'replay of identical feature succeeds and consumes all entries',
      rep.entries.length === rec.recording.entries.length && rep.output.decision === 'clear',
      `consumed ${rep.entries.length}/${rec.recording.entries.length}`
    );
  } catch (e) {
    check(
      'replay of identical feature succeeds and consumes all entries',
      false,
      `unexpected throw: ${(e as Error).message}`
    );
  }

  // 3. Replay where feature makes an extra call -> replay.extra_call
  try {
    await replay(rec.recording, (t) => runFeatureV2_extraCall(t));
    check('extra call is detected as divergence', false, 'expected throw, got success');
  } catch (e) {
    if (e instanceof ReplayDivergenceError && e.structured.code === 'replay.extra_call') {
      check('extra call is detected as divergence', true, e.structured.code);
    } else {
      check(
        'extra call is detected as divergence',
        false,
        `wrong error: ${(e as Error).message}`
      );
    }
  }

  // 4. Replay where input drifts -> replay.input_mismatch
  try {
    await replay(rec.recording, (t) => runFeatureV2_inputDrift(t));
    check('input drift is detected as divergence', false, 'expected throw, got success');
  } catch (e) {
    if (e instanceof ReplayDivergenceError && e.structured.code === 'replay.input_mismatch') {
      check('input drift is detected as divergence', true, e.structured.code);
    } else {
      check(
        'input drift is detected as divergence',
        false,
        `wrong error: ${(e as Error).message}`
      );
    }
  }

  // 5. Replay where feature stops early -> replay.unconsumed_entry
  try {
    await replay(rec.recording, (t) => runFeatureV2_fewerCalls(t));
    check('fewer calls is detected as divergence', false, 'expected throw, got success');
  } catch (e) {
    if (e instanceof ReplayDivergenceError && e.structured.code === 'replay.unconsumed_entry') {
      check('fewer calls is detected as divergence', true, e.structured.code);
    } else {
      check(
        'fewer calls is detected as divergence',
        false,
        `wrong error: ${(e as Error).message}`
      );
    }
  }

  // 6. Determinism: clock.now in replay returns the recorded value, not real time.
  const clockEntry = rec.recording.entries.find((e) => e.kind === 'clock.now');
  check(
    'clock.now was recorded',
    !!clockEntry && clockEntry.output === 1_700_000_000_000,
    `clock entry output: ${String(clockEntry?.output)}`
  );

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
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error('SMOKE CRASH', e);
  process.exit(2);
});
