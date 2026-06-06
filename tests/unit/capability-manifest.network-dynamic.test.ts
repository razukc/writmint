import { describe, it, expect } from 'vitest';
import {
  validateCapabilityManifest,
  type CapabilityManifest,
  type Permission,
} from '../../src/capability-manifest.js';

function base(perm: Permission): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.example',
    version: '0.1.0',
    title: 'Example',
    description: 'An example capability for network-dynamic tests.',
    permissions: [perm],
    actions: [
      {
        id: 'ops.example.go',
        description: 'Ping a user-supplied URL under the policy.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: [perm.id],
        handler: 'go',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

describe('validateCapabilityManifest — network-dynamic structural', () => {
  it('accepts a minimal network-dynamic permission', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const r = validateCapabilityManifest(m);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('rejects a missing hostPolicy', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.host_policy');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy');
  });

  it('rejects a non-array registrableDomain', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: 'acme.com' },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.registrable_domain');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.registrableDomain');
  });

  it('rejects an unsupported scheme value', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], scheme: ['https', 7] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.scheme_value');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.scheme[1]');
  });
});
