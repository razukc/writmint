// Contract: handlers wrap structured errors as `{isError, content}` and rethrow
// plain Errors so MCP transport surfaces them. The rethrow contract is pinned
// in tests/mcp/error-wrapping.test.ts (the `rethrows plain Error...` case).
import { describe, it, expect } from 'vitest';
import { validateManifest, hashManifest, submitManifest, approveManifest, auditEvents } from '../../tools/mcp/handlers.js';
import type { CapabilityManifest } from '../../src/index.js';

const validManifest: CapabilityManifest = {
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
};

describe('validate_manifest handler', () => {
  it('returns ok:true with the hardened manifest for a valid input', async () => {
    const result = await validateManifest({ manifest: validManifest });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.hardened).toBeDefined();
    expect(result.isError).toBeUndefined();
  });

  it('returns ok:false with structured errors for a bad input', async () => {
    const bad = { ...validManifest, id: '' };
    const result = await validateManifest({ manifest: bad as unknown as CapabilityManifest });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.errors.length).toBeGreaterThan(0);
    expect(payload.errors[0]).toHaveProperty('code');
    expect(payload.errors[0]).toHaveProperty('fixHint');
    expect(result.isError).toBeUndefined(); // findings, not a tool failure
  });
});

describe('hash_manifest handler', () => {
  it('returns the same hash for identical manifests', async () => {
    const a = await hashManifest({ manifest: validManifest });
    const b = await hashManifest({ manifest: validManifest });
    expect(JSON.parse(a.content[0].text).hash).toEqual(JSON.parse(b.content[0].text).hash);
  });

  it('returns different hashes for differing manifests', async () => {
    const a = await hashManifest({ manifest: validManifest });
    const b = await hashManifest({
      manifest: { ...validManifest, version: '1.0.1' },
    });
    expect(JSON.parse(a.content[0].text).hash).not.toEqual(JSON.parse(b.content[0].text).hash);
  });
});

describe('submit_manifest handler', () => {
  it('returns state:submitted with hash and warnings for a valid manifest', async () => {
    const result = await submitManifest({ manifest: validManifest });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.state).toBe('submitted');
    expect(payload.hash).toBeDefined();
    expect(payload.manifestId).toBe(validManifest.id);
    expect(Array.isArray(payload.warnings)).toBe(true);
  });

  it('returns isError:true with structured error for an invalid manifest', async () => {
    const bad = {
      ...validManifest,
      permissions: [
        {
          ...validManifest.permissions[0],
          reason: 'short', // Too few words for reason
        },
      ],
    };
    const result = await submitManifest({ manifest: bad as unknown as CapabilityManifest });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toHaveProperty('code');
    expect(payload).toHaveProperty('fixHint');
  });
});

describe('approve_manifest handler', () => {
  it('returns state:approved with hash and manifestId for a valid submission and approval', async () => {
    const result = await approveManifest({
      manifest: validManifest,
      approver: 'alice@example.com',
    });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.state).toBe('approved');
    expect(payload.hash).toBeDefined();
    expect(payload.manifestId).toBe(validManifest.id);
  });

  it('returns isError:true with structured error for an invalid manifest', async () => {
    const bad = {
      ...validManifest,
      permissions: [
        {
          ...validManifest.permissions[0],
          reason: 'short', // Too few words for reason
        },
      ],
    };
    const result = await approveManifest({
      manifest: bad as unknown as CapabilityManifest,
      approver: 'alice@example.com',
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toHaveProperty('code');
    expect(payload).toHaveProperty('fixHint');
  });
});

describe('audit_events handler', () => {
  it('returns an empty events array for a manifest with no recorded transports', async () => {
    const result = await auditEvents({ manifest: validManifest });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events.length).toBe(0);
  });
});

describe('record handler', () => {
  it('returns recording entries for a sequence of storage calls', async () => {
    const { record } = await import('../../tools/mcp/handlers.js');
    const result = await record({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'k', value: 'v' } },
        { kind: 'storage.get', input: { scope: 'cache', key: 'k' } },
      ],
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.recording.entries).toHaveLength(2);
  });
});

describe('replay handler', () => {
  it('returns {result} when replay matches the recording', async () => {
    const { record, replay } = await import('../../tools/mcp/handlers.js');
    const recorded = await record({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'k', value: 'v' } },
      ],
    });
    const recording = JSON.parse(recorded.content[0].text).recording;

    const result = await replay({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      recording,
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'k', value: 'v' } },
      ],
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.result).toBeDefined();
    expect(payload.divergence).toBeUndefined();
    expect(result.isError).toBeUndefined();
  });

  it('returns {divergence} as a non-error result when the recording diverges', async () => {
    const { record, replay } = await import('../../tools/mcp/handlers.js');
    const recorded = await record({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'a', value: '1' } },
      ],
    });
    const recording = JSON.parse(recorded.content[0].text).recording;

    const result = await replay({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      recording,
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'b', value: '2' } },
      ],
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.divergence).toBeDefined();
    expect(payload.divergence.code).toMatch(/replay/);
    expect(result.isError).toBeUndefined();
  });
});

describe('format_error handler', () => {
  it('returns a human-readable single-line representation', async () => {
    const { formatError } = await import('../../tools/mcp/handlers.js');
    const result = await formatError({
      error: {
        code: 'test.bad',
        where: 'somewhere',
        expected: 'good',
        actual: 'bad',
        fixHint: 'fix it',
      },
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.formatted).toBe('[test.bad] somewhere: expected good, got bad — fix it');
  });
});
