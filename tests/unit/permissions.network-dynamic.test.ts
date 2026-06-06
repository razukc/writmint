import { describe, it, expect } from 'vitest';
import {
  createPermissionRegistry,
  PermissionError,
  type HostTransports,
  type NetworkTransport,
} from '../../src/permissions.js';
import type { CapabilityManifest } from '../../src/capability-manifest.js';
import type { NetworkRequest, NetworkResponse } from '../../src/permissions.js';
import type { NetworkDynamicPermission } from '../../src/capability-manifest.js';

function dynManifest(): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.dyn',
    version: '0.1.0',
    title: 'Dyn',
    description: 'Dynamic-host capability used in tests.',
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
        description: 'Dynamic-host action used to drive broker tests.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.dyn'],
        handler: 'go',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

describe('createPermissionRegistry — network-dynamic transport contract', () => {
  it('throws no_resolver when network-dynamic is declared but transport.resolve is absent', () => {
    const transport: NetworkTransport = {
      async request() { return { status: 200, headers: {}, body: null }; },
    };
    const transports: HostTransports = { network: transport };
    expect(() => createPermissionRegistry(dynManifest(), transports)).toThrow(PermissionError);
    try {
      createPermissionRegistry(dynManifest(), transports);
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      expect((e as PermissionError).structured.code).toBe('permission.network.no_resolver');
      expect((e as PermissionError).structured.fixHint).toMatch(/HostTransports\.network\.resolve/);
    }
  });

  it('throws no_resolver when transports.network is undefined and network-dynamic is declared', () => {
    expect(() => createPermissionRegistry(dynManifest(), {})).toThrow(PermissionError);
    try {
      createPermissionRegistry(dynManifest(), {});
    } catch (e) {
      expect((e as PermissionError).structured.code).toBe('permission.network.no_resolver');
    }
  });

  it('does not require resolve when only type:network is declared', () => {
    const manifest: CapabilityManifest = {
      ...dynManifest(),
      permissions: [
        {
          type: 'network',
          id: 'net.s',
          hosts: ['api.acme.com'],
          reason: 'Read from api.acme.com for ops.dyn.go.',
        },
      ],
      actions: [
        {
          ...dynManifest().actions[0],
          permissions: ['net.s'],
        },
      ],
    };
    const transport: NetworkTransport = {
      async request() { return { status: 200, headers: {}, body: null }; },
    };
    expect(() => createPermissionRegistry(manifest, { network: transport })).not.toThrow();
  });
});

function makeTransport(overrides: Partial<NetworkTransport> = {}): NetworkTransport {
  return {
    async request(): Promise<NetworkResponse> { return { status: 200, headers: {}, body: null }; },
    async resolve(): Promise<string[]> { return ['203.0.113.1']; },
    ...overrides,
  };
}

function manifestWithPolicy(
  hp: NetworkDynamicPermission['hostPolicy'],
  methods?: NetworkDynamicPermission['methods']
): CapabilityManifest {
  const m = dynManifest();
  (m.permissions[0] as NetworkDynamicPermission).hostPolicy = hp;
  if (methods) (m.permissions[0] as NetworkDynamicPermission).methods = methods;
  return m;
}

async function call(manifest: CapabilityManifest, transport: NetworkTransport, input: NetworkRequest) {
  const reg = createPermissionRegistry(manifest, { network: transport });
  const scope = reg.forAction('ops.dyn.go');
  const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
  return cap.request(input);
}

describe('network-dynamic broker — per-call checks', () => {
  it('rejects a bad URL', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'not-a-url', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.bad_url' },
    });
  });

  it('rejects an unallowed method', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] }, ['GET']);
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/', method: 'POST' })).rejects.toMatchObject({
      structured: { code: 'permission.network.method_denied' },
    });
  });

  it('rejects a non-allowed scheme (default https only)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'http://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.scheme_denied' },
    });
  });

  it('accepts http when scheme list includes it', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], scheme: ['http'] });
    await expect(call(m, makeTransport(), { url: 'http://status.acme.com/', method: 'GET' })).resolves.toEqual({
      status: 200, headers: {}, body: null,
    });
  });

  it('rejects a non-allowed port (default 443 for https)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com:8443/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.port_denied' },
    });
  });

  it('accepts an explicit allowed port', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], port: [443, 8443] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com:8443/', method: 'GET' })).resolves.toBeDefined();
  });

  it('rejects a path outside pathPrefix', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], pathPrefix: ['/api/v1/'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/admin', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.path_denied' },
    });
  });

  it('accepts a path matching pathPrefix', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], pathPrefix: ['/api/v1/'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/api/v1/x', method: 'GET' })).resolves.toBeDefined();
  });

  it('rejects host outside registrableDomain', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://evil.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.host_policy_denied' },
    });
  });

  it('rejects an IP-literal private host (denyPrivate default true)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://10.0.0.1/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.private_ip_literal' },
    });
  });

  it('rejects a v6-mapped private IP literal', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://[::ffff:127.0.0.1]/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.private_ip_literal' },
    });
  });

  it('rejects an IP-literal public host via suffix mismatch (denyPrivate=false)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], denyPrivate: false });
    await expect(call(m, makeTransport(), { url: 'https://8.8.8.8/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.host_policy_denied' },
    });
  });
});
