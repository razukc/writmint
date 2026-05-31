import { describe, it, expect } from 'vitest';
import { hardenManifest, type CapabilityManifest } from '../../src/capability-manifest.js';

function baseManifest(overrides: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.example',
    version: '0.1.0',
    title: 'Example',
    description: 'An example capability for hardening tests.',
    permissions: [
      {
        type: 'network',
        id: 'net.read',
        hosts: ['api.example.com'],
        methods: ['GET'],
        reason: 'Read example records needed by load action.',
      },
    ],
    actions: [
      {
        id: 'example.load',
        description: 'Load example records from the upstream API.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.read'],
        handler: 'load',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
    ...overrides,
  };
}

describe('hardenManifest — permission.reason.too_short', () => {
  it('flags a reason with fewer than 5 words', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'read records',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'permission.reason.too_short');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].reason');
  });

  it('accepts a reason with exactly 5 words', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'one two three four five',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    expect(errors.find((x) => x.code === 'permission.reason.too_short')).toBeUndefined();
  });
});

describe('hardenManifest — action.description.too_short', () => {
  it('flags an action description with fewer than 5 words', () => {
    const m = baseManifest({
      actions: [
        {
          id: 'example.load',
          description: 'load it',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'load',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'action.description.too_short');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.actions[0].description');
  });

  it('accepts a 5-word action description', () => {
    const m = baseManifest({
      actions: [
        {
          id: 'example.load',
          description: 'one two three four five',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'load',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    expect(errors.find((x) => x.code === 'action.description.too_short')).toBeUndefined();
  });
});

describe('hardenManifest — permission.network.host_wildcard', () => {
  it('flags wildcards in host entries', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['*.example.com'],
          methods: ['GET'],
          reason: 'Read records needed by load action.',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'permission.network.host_wildcard');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].hosts[0]');
  });

  it('accepts hosts without wildcards', () => {
    const m = baseManifest();
    const { errors } = hardenManifest(m);
    expect(errors.find((x) => x.code === 'permission.network.host_wildcard')).toBeUndefined();
  });
});

describe('hardenManifest — permission.storage.scope_wildcard', () => {
  it('flags wildcards in storage scope', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'storage',
          id: 'st.read',
          scope: 'tenant/*',
          mode: 'read',
          reason: 'Read tenant-scoped data for the load action.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load tenant data from storage tier.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['st.read'],
          handler: 'load',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    const e = errors.find((x) => x.code === 'permission.storage.scope_wildcard');
    expect(e).toBeDefined();
    expect(e!.where).toBe('$.permissions[0].scope');
  });

  it('accepts storage scope without wildcards', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'storage',
          id: 'st.read',
          scope: 'tenant/risk-thresholds',
          mode: 'read',
          reason: 'Read tenant-scoped data for the load action.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load tenant data from storage tier.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['st.read'],
          handler: 'load',
        },
      ],
    });
    const { errors } = hardenManifest(m);
    expect(errors.find((x) => x.code === 'permission.storage.scope_wildcard')).toBeUndefined();
  });
});

describe('hardenManifest — permission.reason.no_action_ref (warning)', () => {
  it('warns when reason does not mention any referencing action id', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'Read records from upstream API system.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from upstream API.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'load',
        },
      ],
    });
    const { errors, warnings } = hardenManifest(m);
    expect(errors).toEqual([]);
    const w = warnings.find((x) => x.code === 'permission.reason.no_action_ref');
    expect(w).toBeDefined();
    expect(w!.where).toBe('$.permissions[0].reason');
  });

  it('does not warn when reason mentions a referencing action id', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'Used by example.load to fetch records.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from upstream API.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'load',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    expect(warnings.find((x) => x.code === 'permission.reason.no_action_ref')).toBeUndefined();
  });

  it('does not warn for permissions referenced by no action', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'audit',
          id: 'audit.orphan',
          reason: 'Emit audit events for compliance purposes only.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from upstream API.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: [],
          handler: 'load',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    expect(warnings.find((x) => x.code === 'permission.reason.no_action_ref')).toBeUndefined();
  });
});

describe('hardenManifest — submit() wiring', () => {
  it('SubmitResult includes warnings field', async () => {
    const { ApprovalLifecycle, MemoryCapabilityStore } = await import('../../src/approval.js');
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    const m = baseManifest();
    const result = lifecycle.submit(m);
    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('submit() throws ApprovalError when hardening errors are present', async () => {
    const { ApprovalLifecycle, MemoryCapabilityStore, ApprovalError } = await import(
      '../../src/approval.js'
    );
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['*.example.com'],
          methods: ['GET'],
          reason: 'Read records needed by load action.',
        },
      ],
    });
    expect(() => lifecycle.submit(m)).toThrow(ApprovalError);
  });

  it('submit() ApprovalError carries every hardening error in allErrors', async () => {
    // Pre-v0.3.1: submit() exposed only the first hardening error via the
    // throw. A manifest with multiple hardening violations forced the caller
    // to fix one, retry, see the next, fix that, retry, etc. — N round-trips
    // for N errors. allErrors closes that loop: every violation is on the
    // throw, recoverable in one round-trip.
    const { ApprovalLifecycle, MemoryCapabilityStore, ApprovalError } = await import(
      '../../src/approval.js'
    );
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['*.example.com'],
          methods: ['GET'],
          reason: 'short', // permission.reason.too_short
        },
      ],
      actions: [
        {
          id: 'do.it',
          description: 'do', // action.description.too_short
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'run',
        },
      ],
    });
    try {
      lifecycle.submit(m);
      throw new Error('expected submit to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalError);
      const ae = err as InstanceType<typeof ApprovalError>;
      const codes = ae.allErrors.map((e) => e.code);
      expect(codes).toContain('permission.network.host_wildcard');
      expect(codes).toContain('permission.reason.too_short');
      expect(codes).toContain('action.description.too_short');
      // structured (single) is preserved for backward-compat
      expect(ae.structured).toBe(ae.allErrors[0]);
    }
  });
});

describe('hardenManifest — manifest.unknown_field', () => {
  // Raised by dogfood pass 05: agent shipped a manifest with stray fields
  // (kind on permissions, title on actions, additionalProperties on schemas)
  // that the validator silently accepted. For an authoring agent, accepted-
  // and-ignored reads as accepted-and-meaningful. Warning, not error — first
  // cut surfaces the footgun without breaking carryover manifests.

  it('warns on unknown top-level fields', () => {
    const m = baseManifest() as CapabilityManifest & Record<string, unknown>;
    m.author = 'agent';
    const { warnings } = hardenManifest(m);
    const w = warnings.find((x) => x.code === 'manifest.unknown_field' && x.where === '$.author');
    expect(w).toBeDefined();
    expect(w!.actual).toContain('author');
  });

  it('warns on unknown fields inside a permission', () => {
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'Read example records needed by load action.',
          // @ts-expect-error stray field
          kind: 'net.http.get',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    const w = warnings.find(
      (x) => x.code === 'manifest.unknown_field' && x.where === '$.permissions[0].kind',
    );
    expect(w).toBeDefined();
  });

  it('warns on unknown fields inside an action', () => {
    const m = baseManifest({
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from the upstream API.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read'],
          handler: 'load',
          // @ts-expect-error stray field
          title: 'Load Example Records',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    const w = warnings.find(
      (x) => x.code === 'manifest.unknown_field' && x.where === '$.actions[0].title',
    );
    expect(w).toBeDefined();
  });

  it('does NOT warn on additionalProperties inside a JSONSchema body', () => {
    // additionalProperties is a legitimate JSONSchema field; the rule only
    // applies to manifest structural boundaries, not user-supplied schemas.
    const m = baseManifest({
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from the upstream API.',
          input: {
            type: 'object',
            properties: { url: { type: 'string' } },
            additionalProperties: false,
          },
          output: { type: 'object', additionalProperties: false },
          permissions: ['net.read'],
          handler: 'load',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    const w = warnings.find((x) => x.code === 'manifest.unknown_field');
    expect(w).toBeUndefined();
  });

  it('does NOT warn on canonical top-level fields (no false positives)', () => {
    const m = baseManifest({
      config: { apiKey: { type: 'string', description: 'API key' } },
      screens: [{ id: 's1', title: 'Main', component: 'Main' }],
      events: { emits: ['loaded'] },
    });
    const { warnings } = hardenManifest(m);
    const w = warnings.find((x) => x.code === 'manifest.unknown_field');
    expect(w).toBeUndefined();
  });

  it('does NOT warn on canonical per-permission fields by type', () => {
    // network has hosts/methods, storage has scope/mode, etc. None of these
    // should trip the unknown-field warning when used on the right type.
    const m = baseManifest({
      permissions: [
        {
          type: 'network',
          id: 'net.read',
          hosts: ['api.example.com'],
          methods: ['GET'],
          reason: 'Read example records needed by load action.',
        },
        {
          type: 'storage',
          id: 'store.cache',
          scope: 'cache/items',
          mode: 'readwrite',
          reason: 'Cache fetched example records for the load action.',
        },
      ],
      actions: [
        {
          id: 'example.load',
          description: 'Load example records from the upstream API.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.read', 'store.cache'],
          handler: 'load',
        },
      ],
    });
    const { warnings } = hardenManifest(m);
    const w = warnings.find((x) => x.code === 'manifest.unknown_field');
    expect(w).toBeUndefined();
  });

  it('warns separately for each stray field (exhaustive within the rule)', () => {
    const m = baseManifest() as CapabilityManifest & Record<string, unknown>;
    m.author = 'agent';
    m.notes = 'whatever';
    const { warnings } = hardenManifest(m);
    const matches = warnings.filter((x) => x.code === 'manifest.unknown_field');
    expect(matches.length).toBe(2);
    const wheres = matches.map((w) => w.where).sort();
    expect(wheres).toEqual(['$.author', '$.notes']);
  });
});
