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
});
