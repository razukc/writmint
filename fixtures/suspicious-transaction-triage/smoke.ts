import { manifest } from './manifest.js';
import {
  createFeatureCapabilityRegistry,
  CapabilityError,
  type HostTransports,
  type NetworkBroker,
  type StorageBroker,
  type AuditBroker,
} from '../../src/capabilities.js';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

async function expectThrows(name: string, fn: () => Promise<unknown> | unknown, code: string): Promise<void> {
  try {
    await fn();
    check(name, false, `expected throw [${code}], got success`);
  } catch (e) {
    if (e instanceof CapabilityError && e.structured.code === code) {
      check(name, true, `threw [${code}] as expected`);
    } else {
      const got = e instanceof CapabilityError ? e.structured.code : String(e);
      check(name, false, `expected [${code}], got ${got}`);
    }
  }
}

async function expectOk(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
    check(name, true, 'ok');
  } catch (e) {
    const got = e instanceof CapabilityError ? e.structured.code : String(e);
    check(name, false, `unexpected throw: ${got}`);
  }
}

const networkLog: { capabilityHint: string; url: string; method: string }[] = [];
const auditLog: { capabilityId: string; name: string }[] = [];

const transports: HostTransports = {
  network: {
    async request(input) {
      networkLog.push({ capabilityHint: 'via-broker', url: input.url, method: input.method });
      return { status: 200, headers: {}, body: { ok: true } };
    },
  },
  storage: {
    async get(scope, key) {
      return { scope, key, value: 'mock' };
    },
    async put() {
      /* no-op */
    },
    async delete() {
      /* no-op */
    },
    async list() {
      return [];
    },
  },
  audit: {
    emit(ev) {
      auditLog.push({ capabilityId: ev.capabilityId, name: ev.name });
    },
  },
  clock: {
    now: () => 1_700_000_000_000,
  },
};

const reg = createFeatureCapabilityRegistry(manifest, transports);

async function run(): Promise<void> {
  const loadAlert = reg.forAction('triage.load_alert');
  const watchlist = reg.forAction('triage.run_watchlist_check');
  const submit = reg.forAction('triage.submit_decision');

  await expectOk('loadAlert can call core.transactions (declared)', async () => {
    const net = loadAlert.cap('core.transactions') as NetworkBroker;
    await net.request({ url: 'https://core-banking.internal/tx/abc', method: 'GET' });
  });

  await expectThrows(
    'loadAlert cannot call sanctions.watchlist (not declared on this action)',
    async () => {
      loadAlert.cap('sanctions.watchlist');
    },
    'capability.denied'
  );

  await expectThrows(
    'loadAlert cannot call cases.write (destructive, not on this action)',
    async () => {
      loadAlert.cap('cases.write');
    },
    'capability.denied'
  );

  await expectThrows(
    'sharing a host does not collapse capability ids: account_history broker rejects transactions-shaped URL on the wrong cap',
    async () => {
      const net = loadAlert.cap('core.account_history') as NetworkBroker;
      await net.request({ url: 'https://elsewhere.internal/anything', method: 'GET' });
    },
    'capability.network.host_denied'
  );

  await expectThrows(
    'method enforcement: watchlist cap declared POST only, GET denied',
    async () => {
      const net = watchlist.cap('sanctions.watchlist') as NetworkBroker;
      await net.request({ url: 'https://watchlist.vendor.example.com/check', method: 'GET' });
    },
    'capability.network.method_denied'
  );

  await expectOk('watchlist POST allowed', async () => {
    const net = watchlist.cap('sanctions.watchlist') as NetworkBroker;
    await net.request({
      url: 'https://watchlist.vendor.example.com/check',
      method: 'POST',
      body: { name: 'Acme' },
    });
  });

  await expectThrows(
    'storage read-only capability rejects writes',
    async () => {
      const store = loadAlert.cap('tenant.thresholds') as StorageBroker;
      await store.put('high-value', 10000);
    },
    'capability.storage.write_denied'
  );

  await expectOk('storage read-only capability allows reads', async () => {
    const store = loadAlert.cap('tenant.thresholds') as StorageBroker;
    await store.get('high-value');
  });

  await expectOk('audit broker emits via transport', async () => {
    const audit = loadAlert.cap('audit.triage') as AuditBroker;
    audit.emit('triage.alert_loaded', { alertId: 'a1' });
  });

  await expectThrows(
    'undeclared capability id is rejected outright',
    async () => {
      loadAlert.cap('made.up');
    },
    'capability.undeclared'
  );

  await expectThrows(
    'unknown action id is rejected at registry boundary',
    async () => {
      reg.forAction('not.a.real.action');
    },
    'capability.action.unknown'
  );

  await expectOk('submit_decision can write back via cases.write', async () => {
    const net = submit.cap('cases.write') as NetworkBroker;
    await net.request({
      url: 'https://cases.internal/decisions',
      method: 'POST',
      body: { alertId: 'a1', decision: 'clear' },
    });
  });

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
  console.log(`Network broker calls: ${networkLog.length}`);
  console.log(`Audit events: ${auditLog.length}`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error('SMOKE CRASH', e);
  process.exit(2);
});
