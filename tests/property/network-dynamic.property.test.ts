import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  createPermissionRegistry,
  type NetworkRequest,
  type NetworkResponse,
  type NetworkTransport,
  type HostTransports,
} from '../../src/permissions.js';
import { record, replay } from '../../src/replay.js';
import type { CapabilityManifest, NetworkDynamicPermission } from '../../src/capability-manifest.js';

const labelArb = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,8}[a-z0-9])?$/);
const domainArb = fc.constantFrom('acme.com', 'b.com');

// Three shapes: well-formed subdomain hosts, suffix-without-boundary hosts
// (e.g. 'evilacme.com' must NOT match policy ['acme.com']), and mixed-case
// variants of either to probe the implementation's case handling.
const hostArb = fc
  .tuple(
    fc.oneof(
      fc.tuple(labelArb, domainArb).map(([sub, dom]) => `${sub}.${dom}`),
      domainArb.map((dom) => `evil${dom}`),
    ),
    fc.boolean(),
  )
  .map(([host, upper]) => (upper ? host.toUpperCase() : host));

const policyArb = fc.record({
  registrableDomain: fc.constantFrom<string[]>(['acme.com'], ['b.com'], ['acme.com', 'b.com']),
});

const deniedIpArb = fc.constantFrom(
  // pre-existing deny set
  '10.0.0.1', '172.16.0.1', '192.168.0.1', '127.0.0.1', '169.254.0.1', '100.64.0.1',
  '::1', 'fc00::1', 'fe80::1',
  // completed deny set (v0.5.2)
  '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1',
  '224.0.0.251', '240.0.0.1',
  'ff02::1', '2001:db8::1', '100::1', '64:ff9b:1::1',
);

function manifestFor(hp: NetworkDynamicPermission['hostPolicy']): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.dyn',
    version: '0.1.0',
    title: 'Dyn',
    description: 'Property test capability for network-dynamic invariants.',
    permissions: [
      {
        type: 'network-dynamic',
        id: 'net.dyn',
        hostPolicy: hp,
        reason: 'Pings user-supplied URLs under the policy from ops.dyn.go.',
      },
    ],
    actions: [
      {
        id: 'ops.dyn.go',
        description: 'Dynamic-host action used in property tests.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.dyn'],
        handler: 'go',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

const ok: NetworkTransport = {
  async resolve() { return ['93.184.216.34']; },
  async request() { return { status: 200, headers: {}, body: null }; },
};

function suffixMatch(host: string, domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((raw) => {
    const d = raw.toLowerCase();
    return h === d || h.endsWith('.' + d);
  });
}

describe('network-dynamic — invariants', () => {
  it('passes when host suffix-matches policy AND scheme/port/path/private all pass', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, hostArb, async (hp, host) => {
        fc.pre(suffixMatch(host, hp.registrableDomain));
        const reg = createPermissionRegistry(manifestFor(hp), { network: ok });
        const scope = reg.forAction('ops.dyn.go');
        const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
        await cap.request({ url: `https://${host}/`, method: 'GET' });
      }),
    );
  });

  it('rejects with host_policy_denied when the host fails the suffix check', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, hostArb, async (hp, host) => {
        fc.pre(!suffixMatch(host, hp.registrableDomain));
        const reg = createPermissionRegistry(manifestFor(hp), { network: ok });
        const scope = reg.forAction('ops.dyn.go');
        const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
        await cap.request({ url: `https://${host}/`, method: 'GET' }).then(
          () => { throw new Error('expected rejection'); },
          (e: { structured?: { code?: string } }) => {
            if (e.structured?.code !== 'permission.network.host_policy_denied') {
              throw new Error(`expected host_policy_denied, got ${e.structured?.code}`);
            }
          },
        );
      }),
    );
  });

  it('rejects resolved_to_private for every address in the deny set', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, hostArb, deniedIpArb, async (hp, host, ip) => {
        fc.pre(suffixMatch(host, hp.registrableDomain));
        const t: NetworkTransport = {
          async resolve() { return [ip]; },
          async request() { throw new Error('must not be called'); },
        };
        const reg = createPermissionRegistry(manifestFor(hp), { network: t });
        const scope = reg.forAction('ops.dyn.go');
        const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
        await cap.request({ url: `https://${host}/`, method: 'GET' }).then(
          () => { throw new Error('expected rejection'); },
          (e: { structured?: { code?: string } }) => {
            if (e.structured?.code !== 'permission.network.resolved_to_private') {
              throw new Error(`expected resolved_to_private for ${ip}, got ${e.structured?.code}`);
            }
          },
        );
      }),
    );
  });

  it('replay round-trips: record then replay yields the same output', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, hostArb, async (hp, host) => {
        fc.pre(suffixMatch(host, hp.registrableDomain));
        const run = async (t: HostTransports) => {
          const reg = createPermissionRegistry(manifestFor(hp), t);
          const scope = reg.forAction('ops.dyn.go');
          const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
          return cap.request({ url: `https://${host}/`, method: 'GET' });
        };
        const rec = await record({ network: ok }, run);
        const rep = await replay(rec.recording, run);
        if (JSON.stringify(rec.output) !== JSON.stringify(rep.output)) {
          throw new Error('replay diverged');
        }
      }),
    );
  });
});
