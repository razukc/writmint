import { describe, it, expect } from 'vitest';
import {
  createPermissionRegistry,
  PermissionError,
  type HostTransports,
  type NetworkTransport,
  type NetworkRequest,
  type NetworkResponse,
} from '../../src/permissions.js';
import { formatStructuredError, type StructuredError } from '../../src/errors.js';
import type { CapabilityManifest, NetworkDynamicPermission } from '../../src/capability-manifest.js';

// fixHint must be fully rendered: no template placeholders may leak into it.
const PLACEHOLDER = /<actual>|<id>|<allowed>|<host>|<ip>|<range-name>|<underlying>/;

function dynManifest(hp?: NetworkDynamicPermission['hostPolicy']): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.dyn',
    version: '0.1.0',
    title: 'Dyn',
    description: 'Dynamic-host capability used in error-format tests.',
    permissions: [
      {
        type: 'network-dynamic',
        id: 'net.dyn',
        hostPolicy: hp ?? { registrableDomain: ['acme.com'] },
        reason: 'Pings user-supplied URLs under acme.com from ops.dyn.go.',
      },
    ],
    actions: [
      {
        id: 'ops.dyn.go',
        description: 'Dynamic-host action used to drive error-format tests.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.dyn'],
        handler: 'go',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

function makeTransport(overrides: Partial<NetworkTransport> = {}): NetworkTransport {
  return {
    async request(): Promise<NetworkResponse> { return { status: 200, headers: {}, body: null }; },
    async resolve(): Promise<string[]> { return ['203.0.113.1']; },
    ...overrides,
  };
}

async function trigger(
  manifest: CapabilityManifest,
  transport: NetworkTransport,
  input: NetworkRequest
): Promise<StructuredError> {
  const reg = createPermissionRegistry(manifest, { network: transport });
  const scope = reg.forAction('ops.dyn.go');
  const cap = scope.cap('net.dyn') as { request: (i: NetworkRequest) => Promise<NetworkResponse> };
  try {
    await cap.request(input);
  } catch (e) {
    expect(e).toBeInstanceOf(PermissionError);
    return (e as PermissionError).structured;
  }
  throw new Error('expected the broker to reject');
}

function assertHygiene(s: StructuredError, code: string, fieldHint: RegExp): void {
  expect(s.code).toBe(code);
  expect(s.fixHint).not.toMatch(PLACEHOLDER);
  expect(s.fixHint).toMatch(fieldHint);
  expect(formatStructuredError(s)).toContain(code);
}

describe('network-dynamic — structured error format and fixHint hygiene', () => {
  it('scheme_denied names hostPolicy.scheme', async () => {
    const s = await trigger(dynManifest(), makeTransport(), {
      url: 'http://status.acme.com/',
      method: 'GET',
    });
    assertHygiene(s, 'permission.network.scheme_denied', /hostPolicy\.scheme/);
  });

  it('port_denied names hostPolicy.port', async () => {
    const s = await trigger(dynManifest(), makeTransport(), {
      url: 'https://status.acme.com:9999/',
      method: 'GET',
    });
    assertHygiene(s, 'permission.network.port_denied', /hostPolicy\.port/);
  });

  it('path_denied names hostPolicy.pathPrefix', async () => {
    const s = await trigger(
      dynManifest({ registrableDomain: ['acme.com'], pathPrefix: ['/api/v1/'] }),
      makeTransport(),
      { url: 'https://status.acme.com/x', method: 'GET' }
    );
    assertHygiene(s, 'permission.network.path_denied', /hostPolicy\.pathPrefix/);
  });

  it('host_policy_denied names hostPolicy.registrableDomain', async () => {
    const s = await trigger(dynManifest(), makeTransport(), {
      url: 'https://evil.com/',
      method: 'GET',
    });
    assertHygiene(s, 'permission.network.host_policy_denied', /hostPolicy\.registrableDomain/);
  });

  it('private_ip_literal names denyPrivate', async () => {
    const s = await trigger(dynManifest(), makeTransport(), {
      url: 'https://10.0.0.1/',
      method: 'GET',
    });
    assertHygiene(s, 'permission.network.private_ip_literal', /denyPrivate/);
  });

  it('resolved_to_private names denyPrivate', async () => {
    const s = await trigger(
      dynManifest(),
      makeTransport({ async resolve() { return ['10.0.0.1']; } }),
      { url: 'https://status.acme.com/', method: 'GET' }
    );
    assertHygiene(s, 'permission.network.resolved_to_private', /denyPrivate/);
  });

  it('resolve_failed points at the resolver/hostname', async () => {
    const s = await trigger(
      dynManifest(),
      makeTransport({ async resolve() { throw new Error('ENOTFOUND'); } }),
      { url: 'https://status.acme.com/', method: 'GET' }
    );
    assertHygiene(s, 'permission.network.resolve_failed', /resolver|hostname/);
  });

  it('no_resolver names HostTransports.network.resolve', () => {
    const transports: HostTransports = {
      network: { async request() { return { status: 200, headers: {}, body: null }; } },
    };
    let s: StructuredError | undefined;
    try {
      createPermissionRegistry(dynManifest(), transports);
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      s = (e as PermissionError).structured;
    }
    expect(s).toBeDefined();
    assertHygiene(s!, 'permission.network.no_resolver', /HostTransports\.network\.resolve/);
  });
});
