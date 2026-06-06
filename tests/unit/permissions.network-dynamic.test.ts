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

  it('pairs default ports per scheme: https on port 80 is denied when port is unset', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], scheme: ['http', 'https'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com:80/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.port_denied' },
    });
  });

  it('pairs default ports per scheme: http on 80 and https on 443 both pass when port is unset', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], scheme: ['http', 'https'] });
    await expect(call(m, makeTransport(), { url: 'http://status.acme.com/', method: 'GET' })).resolves.toBeDefined();
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/', method: 'GET' })).resolves.toBeDefined();
  });

  it('explicit port list applies to all schemes (no pairing)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], scheme: ['http', 'https'], port: [8080] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com:8080/', method: 'GET' })).resolves.toBeDefined();
    await expect(call(m, makeTransport(), { url: 'http://status.acme.com:8080/', method: 'GET' })).resolves.toBeDefined();
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.port_denied' },
    });
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

  it('rejects the IPv6 loopback literal [::1]', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://[::1]/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.private_ip_literal' },
    });
  });

  it('accepts an explicit :443 on https when port is unset (URL normalizes default ports away)', async () => {
    // Pins the WHATWG normalization the port check relies on.
    expect(new URL('https://status.acme.com:443/').port).toBe('');
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com:443/', method: 'GET' })).resolves.toBeDefined();
  });

  // pathPrefix checks run on URL.pathname, which resolves dot segments —
  // pinned here like the octal-IPv4 normalization test in host-policy.test.ts.
  it('rejects pathPrefix escape via dot-segment traversal', async () => {
    expect(new URL('https://status.acme.com/api/../private').pathname).toBe('/private');
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], pathPrefix: ['/api'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/api/../private', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.path_denied' },
    });
  });

  it('rejects pathPrefix escape via percent-encoded dot segments', async () => {
    expect(new URL('https://status.acme.com/api/%2e%2e/private').pathname).toBe('/private');
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], pathPrefix: ['/api'] });
    await expect(call(m, makeTransport(), { url: 'https://status.acme.com/api/%2e%2e/private', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.path_denied' },
    });
  });

  it('rejects an IP-literal public host via suffix mismatch (denyPrivate=false)', async () => {
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], denyPrivate: false });
    await expect(call(m, makeTransport(), { url: 'https://8.8.8.8/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.host_policy_denied' },
    });
  });
});

describe('network-dynamic broker — resolve + private-IP filter + pin', () => {
  it('resolves the hostname and passes resolvedIp to transport.request', async () => {
    const seen: Array<NetworkRequest & { resolvedIp?: string }> = [];
    const transport: NetworkTransport = {
      async resolve() { return ['203.0.113.1']; },
      async request(input) { seen.push(input); return { status: 200, headers: {}, body: null }; },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await call(m, transport, { url: 'https://status.acme.com/', method: 'GET' });
    expect(seen).toHaveLength(1);
    expect(seen[0].resolvedIp).toBe('203.0.113.1');
  });

  it('rejects when hostname resolves to a private IP (denyPrivate default true)', async () => {
    const transport: NetworkTransport = {
      async resolve() { return ['10.0.0.42']; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolved_to_private' },
    });
  });

  it('rejects when any resolved IP is private (conservative)', async () => {
    const transport: NetworkTransport = {
      async resolve() { return ['203.0.113.1', '10.0.0.1']; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolved_to_private' },
    });
  });

  it('allows private resolution when denyPrivate=false', async () => {
    const seen: Array<NetworkRequest & { resolvedIp?: string }> = [];
    const transport: NetworkTransport = {
      async resolve() { return ['10.0.0.42']; },
      async request(input) { seen.push(input); return { status: 200, headers: {}, body: null }; },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], denyPrivate: false });
    await call(m, transport, { url: 'https://status.acme.com/', method: 'GET' });
    expect(seen[0].resolvedIp).toBe('10.0.0.42');
  });

  it('rejects when transport.resolve throws', async () => {
    const transport: NetworkTransport = {
      async resolve() { throw new Error('ENOTFOUND'); },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolve_failed' },
    });
  });

  it('rejects an expanded-form private IPv6 resolution (non-canonical resolver output)', async () => {
    const transport: NetworkTransport = {
      async resolve() { return ['0:0:0:0:0:0:0:1']; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolved_to_private' },
    });
  });

  it('rejects when transport.resolve returns a non-IP string (fail closed)', async () => {
    const transport: NetworkTransport = {
      async resolve() { return ['not-an-ip']; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolve_failed' },
    });
  });

  it('rejects a non-IP resolver string even when denyPrivate=false', async () => {
    const transport: NetworkTransport = {
      async resolve() { return ['not-an-ip']; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'], denyPrivate: false });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolve_failed' },
    });
  });

  it('rejects when transport.resolve returns an empty array', async () => {
    const transport: NetworkTransport = {
      async resolve() { return []; },
      async request() { throw new Error('should not be called'); },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    await expect(call(m, transport, { url: 'https://status.acme.com/', method: 'GET' })).rejects.toMatchObject({
      structured: { code: 'permission.network.resolve_failed' },
    });
  });

  it('memoizes the resolve within a single action scope', async () => {
    let resolveCalls = 0;
    const transport: NetworkTransport = {
      async resolve() { resolveCalls++; return ['203.0.113.1']; },
      async request() { return { status: 200, headers: {}, body: null }; },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    const reg = createPermissionRegistry(m, { network: transport });
    const scope = reg.forAction('ops.dyn.go');
    const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
    await cap.request({ url: 'https://status.acme.com/a', method: 'GET' });
    await cap.request({ url: 'https://status.acme.com/b', method: 'GET' });
    expect(resolveCalls).toBe(1);
  });

  it('does not memoize across action scopes', async () => {
    let resolveCalls = 0;
    const transport: NetworkTransport = {
      async resolve() { resolveCalls++; return ['203.0.113.1']; },
      async request() { return { status: 200, headers: {}, body: null }; },
    };
    const m = manifestWithPolicy({ registrableDomain: ['acme.com'] });
    const reg = createPermissionRegistry(m, { network: transport });

    const scopeA = reg.forAction('ops.dyn.go');
    const capA = scopeA.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
    await capA.request({ url: 'https://status.acme.com/', method: 'GET' });

    const scopeB = reg.forAction('ops.dyn.go');
    const capB = scopeB.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
    await capB.request({ url: 'https://status.acme.com/', method: 'GET' });

    expect(resolveCalls).toBe(2);
  });
});
