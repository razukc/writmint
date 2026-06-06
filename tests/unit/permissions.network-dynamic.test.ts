import { describe, it, expect } from 'vitest';
import {
  createPermissionRegistry,
  PermissionError,
  type HostTransports,
  type NetworkTransport,
} from '../../src/permissions.js';
import type { CapabilityManifest } from '../../src/capability-manifest.js';

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
