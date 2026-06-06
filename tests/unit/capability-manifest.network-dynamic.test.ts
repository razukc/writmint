import { describe, it, expect } from 'vitest';
import {
  validateCapabilityManifest,
  hardenManifest,
  type CapabilityManifest,
  type Permission,
} from '../../src/capability-manifest.js';
import { hashManifest } from '../../src/approval.js';

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

describe('hardenManifest — network/network-dynamic mutual exclusivity', () => {
  it('errors when hosts is present on type:network-dynamic', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'] },
      // @ts-expect-error hosts is forbidden on network-dynamic
      hosts: ['acme.com'],
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'permission.network-dynamic.hosts_forbidden');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hosts');
  });

  it('errors when hostPolicy is present on type:network', () => {
    const m = base({
      type: 'network',
      id: 'net.read',
      hosts: ['api.acme.com'],
      // @ts-expect-error hostPolicy is forbidden on network
      hostPolicy: { registrableDomain: ['acme.com'] },
      reason: 'Reads fixed acme endpoints needed by ops.example.go.',
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'permission.network.host_policy_forbidden');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy');
  });
});

describe('hardenManifest — network-dynamic registrable domain wildcards', () => {
  it('rejects "*.acme.com"', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['*.acme.com'] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const { errors } = hardenManifest(m);
    const e = errors.find(
      (x) => x.code === 'permission.network-dynamic.registrable_domain_invalid',
    );
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.registrableDomain[0]');
  });

  it('rejects ".acme.com"', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['.acme.com'] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const { errors } = hardenManifest(m);
    const e = errors.find(
      (x) => x.code === 'permission.network-dynamic.registrable_domain_invalid',
    );
    expect(e).toBeDefined();
  });

  it('accepts a literal registrable domain', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const { errors } = hardenManifest(m);
    expect(
      errors.find((x) => x.code === 'permission.network-dynamic.registrable_domain_invalid'),
    ).toBeUndefined();
  });
});

describe('hashManifest — hostPolicy is hash-bound', () => {
  function manifestWithDomain(domain: string): CapabilityManifest {
    return base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: [domain] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
  }

  it('a one-byte change inside hostPolicy changes the hash', () => {
    const a = hashManifest(manifestWithDomain('acme.com'));
    const b = hashManifest(manifestWithDomain('acme.co'));
    expect(a).not.toBe(b);
  });

  it('an identical structuredClone hashes the same', () => {
    const m = manifestWithDomain('acme.com');
    expect(hashManifest(structuredClone(m))).toBe(hashManifest(m));
  });
});
