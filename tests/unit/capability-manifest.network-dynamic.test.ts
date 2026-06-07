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
    // The fixHint's example must be a fill-in marker, not a valid domain:
    // dogfood pass 05b showed agents copy-paste the hint's example verbatim,
    // and "example.com" was accepted. "<your-domain>" fails hardening if
    // pasted, forcing a real policy decision.
    expect(e!.fixHint).toContain('<your-domain>');
    expect(e!.fixHint).not.toContain('example.com');
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
    // Same un-copy-pasteable rule as host_policy (see above).
    expect(e!.fixHint).toContain('<your-domain>');
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

  it('rejects a non-string registrableDomain entry', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com', 7] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find(
      (x) => x.code === 'permission.network-dynamic.registrable_domain_value',
    );
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.registrableDomain[1]');
  });

  it('rejects a non-array scheme', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], scheme: 'https' },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.scheme');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.scheme');
  });

  it('rejects a non-array port', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], port: 443 },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.port');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.port');
  });

  it('rejects out-of-range and non-integer port values, accepts the 1..65535 boundaries', () => {
    const rejectedPorts = [0, 65536, 80.5];
    for (const port of rejectedPorts) {
      const m = base({
        type: 'network-dynamic',
        id: 'net.dyn',
        hostPolicy: { registrableDomain: ['acme.com'], port: [port] },
        reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
      } as unknown as Permission);
      const r = validateCapabilityManifest(m);
      const e = r.errors.find((x) => x.code === 'permission.network-dynamic.port_value');
      expect(e).toBeDefined();
      expect(e!.where).toBe('$.permissions[0].hostPolicy.port[0]');
    }

    const ok = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], port: [1, 65535] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    });
    const r = validateCapabilityManifest(ok);
    expect(
      r.errors.filter((x) => x.code.startsWith('permission.network-dynamic.port')),
    ).toEqual([]);
  });

  it('rejects a non-boolean denyPrivate', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], denyPrivate: 'yes' },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.deny_private');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.denyPrivate');
  });

  it('rejects a non-array pathPrefix', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], pathPrefix: '/api' },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.path_prefix');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.pathPrefix');
  });

  it('rejects a pathPrefix entry without a leading slash', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], pathPrefix: ['api'] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.path_prefix_value');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.pathPrefix[0]');
  });

  it('rejects a non-string pathPrefix entry', () => {
    const m = base({
      type: 'network-dynamic',
      id: 'net.dyn',
      hostPolicy: { registrableDomain: ['acme.com'], pathPrefix: [7] },
      reason: 'Pings user-supplied URLs under acme.com from ops.example.go.',
    } as unknown as Permission);
    const r = validateCapabilityManifest(m);
    const e = r.errors.find((x) => x.code === 'permission.network-dynamic.path_prefix_value');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hostPolicy.pathPrefix[0]');
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
    expect(e!.where).toBe('$.permissions[0].hostPolicy.registrableDomain[0]');
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
