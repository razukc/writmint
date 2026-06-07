import { describe, it, expect } from 'vitest';
import {
  createPermissionRegistry,
  type HostTransports,
  type NetworkRequest,
  type NetworkResponse,
} from '../../src/permissions.js';
import { record, replay } from '../../src/replay.js';
import type { CapabilityManifest } from '../../src/capability-manifest.js';

function dynManifest(): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.dyn',
    version: '0.1.0',
    title: 'Dyn',
    description: 'Dynamic-host capability used in replay integration tests.',
    permissions: [
      {
        type: 'network-dynamic',
        id: 'net.dyn',
        hostPolicy: { registrableDomain: ['acme.com'] },
        reason: 'Pings user-supplied URLs under acme.com from ops.dyn.go.',
      },
    ],
    actions: [
      {
        id: 'ops.dyn.go',
        description: 'Dynamic-host action used in replay integration tests.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.dyn'],
        handler: 'go',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

const baseTransport = {
  async resolve(host: string): Promise<string[]> {
    if (host === 'status.acme.com') return ['93.184.216.34'];
    if (host === 'health.acme.com') return ['93.184.216.35'];
    return ['93.184.216.99'];
  },
  async request(input: NetworkRequest & { resolvedIp?: string }): Promise<NetworkResponse> {
    return { status: 200, headers: {}, body: { url: input.url, ip: input.resolvedIp ?? null } };
  },
};

async function runOnce(transports: HostTransports): Promise<NetworkResponse> {
  const reg = createPermissionRegistry(dynManifest(), transports);
  const scope = reg.forAction('ops.dyn.go');
  const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
  return cap.request({ url: 'https://status.acme.com/healthz', method: 'GET' });
}

describe('network-dynamic replay', () => {
  it('records a network.resolve before the network.request', async () => {
    const { recording, output } = await record({ network: baseTransport }, (t) => runOnce(t));
    expect(output.status).toBe(200);
    expect(recording.entries.map((e) => e.kind)).toEqual(['network.resolve', 'network.request']);
    expect(recording.entries[0].input).toEqual({ hostname: 'status.acme.com' });
    expect(recording.entries[0].output).toEqual(['93.184.216.34']);
  });

  it('replays a recording deterministically', async () => {
    const { recording, output } = await record({ network: baseTransport }, (t) => runOnce(t));
    const { output: replayed } = await replay(recording, (t) => runOnce(t));
    expect(replayed).toEqual(output);
  });

  it('diverges when the recording is missing the resolve entry', async () => {
    const { recording } = await record({ network: baseTransport }, (t) => runOnce(t));
    const truncated = {
      schemaVersion: 1 as const,
      entries: recording.entries.filter((e) => e.kind !== 'network.resolve'),
    };
    await expect(replay(truncated, (t) => runOnce(t))).rejects.toMatchObject({
      structured: { code: 'replay.kind_mismatch' },
    });
  });

  it('replays a resolver throw: resolve_failed round-trips', async () => {
    const throwing = { ...baseTransport, async resolve(): Promise<string[]> { throw new Error('ENOTFOUND'); } };
    const run = async (t: HostTransports) => {
      try { await runOnce(t); return 'unexpected-success'; }
      catch (e) { return (e as { structured: { code: string } }).structured.code; }
    };
    const { recording, output } = await record({ network: throwing }, run);
    expect(output).toBe('permission.network.resolve_failed');
    expect(recording.entries[0]).toMatchObject({ kind: 'network.resolve', threw: true });
    const { output: replayed } = await replay(recording, run);
    expect(replayed).toBe('permission.network.resolve_failed');
  });

  it('emits no audit events for a network-dynamic request (network calls do not auto-audit)', async () => {
    const auditEvents: unknown[] = [];
    const transports: HostTransports = {
      network: baseTransport,
      audit: { emit(e) { auditEvents.push(e); } },
    };
    await runOnce(transports);
    expect(auditEvents).toEqual([]);
  });

  it('tape entries for type:network manifests are unchanged (no network.resolve appears)', async () => {
    const sm: CapabilityManifest = {
      ...dynManifest(),
      permissions: [
        {
          type: 'network',
          id: 'net.s',
          hosts: ['status.acme.com'],
          reason: 'Read from status.acme.com on ops.dyn.go.',
        },
      ],
      actions: [
        {
          ...dynManifest().actions[0],
          permissions: ['net.s'],
        },
      ],
    };
    const { recording } = await record({ network: baseTransport }, async (t) => {
      const reg = createPermissionRegistry(sm, t);
      const scope = reg.forAction('ops.dyn.go');
      const cap = scope.cap('net.s') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
      return cap.request({ url: 'https://status.acme.com/', method: 'GET' });
    });
    expect(recording.entries.map((e) => e.kind)).toEqual(['network.request']);
  });
});
