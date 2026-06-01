// Contract (v0.3.2+): every handler returns a CallToolResult with a single
// text content block carrying a tagged-union envelope:
//   { ok: true,  data:   <handler-specific> }   — envelope.isError unset
//   { ok: false, errors: StructuredError[] }    — envelope.isError === true
// The MCP-level isError flag and inner-text `ok` are redundant by design;
// both signal the same outcome. Callers branch once on either channel.
//
// Plain Errors are still rethrown so the MCP transport surfaces them; the
// rethrow contract is pinned in tests/mcp/error-wrapping.test.ts.

import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  hashManifest,
  submitManifest,
  approveManifest,
  auditEvents,
} from '../../tools/mcp/handlers.js';
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
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.hardened).toBeDefined();
  });

  it('returns isError:true with ok:false + errors[] for a bad input', async () => {
    // v0.3.2: validation failure is a tool failure (isError:true), not a
    // success-with-ok:false result. The MCP-level signal now matches the
    // inner-text shape; the agent branches once. See v0.3 candidate #3.
    const bad = { ...validManifest, id: '' };
    const result = await validateManifest({ manifest: bad as unknown as CapabilityManifest });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(false);
    expect(Array.isArray(payload.errors)).toBe(true);
    expect(payload.errors.length).toBeGreaterThan(0);
    expect(payload.errors[0]).toHaveProperty('code');
    expect(payload.errors[0]).toHaveProperty('fixHint');
  });

  it('returns every violation (structural + hardening) in one rejection', async () => {
    // Pass 06 scenario: pre-v0.3.1 the pipeline short-circuited between
    // stages; v0.3.1 added verifyManifest which collects both. v0.3.2
    // surfaces every error via the new errors[] array. Together: a mixed
    // first-draft manifest's full picture in one round-trip.
    const bad: unknown = {
      schemaVersion: 1,
      id: 'ops.multi-fail',
      version: 'not-a-semver', // structural
      title: 'Multi fail',
      description: 'A capability deliberately violating several rules.',
      permissions: [
        {
          type: 'network',
          id: 'net.api',
          hosts: ['*.example.com'], // hardening
          methods: ['GET'],
          reason: 'short', // hardening
        },
      ],
      actions: [
        {
          id: 'do.it',
          description: 'do', // hardening
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['net.api'],
          handler: 'run',
        },
      ],
      implementation: { type: 'module', entry: './impl.js' },
    };
    const result = await validateManifest({ manifest: bad as CapabilityManifest });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    const codes: string[] = payload.errors.map((e: { code: string }) => e.code);
    expect(codes).toContain('semver.invalid');
    expect(codes).toContain('permission.network.host_wildcard');
    expect(codes).toContain('permission.reason.too_short');
    expect(codes).toContain('action.description.too_short');
  });
});

describe('hash_manifest handler', () => {
  it('returns the same hash for identical manifests', async () => {
    const a = await hashManifest({ manifest: validManifest });
    const b = await hashManifest({ manifest: validManifest });
    const ha = JSON.parse(a.content[0]!.text).data.hash;
    const hb = JSON.parse(b.content[0]!.text).data.hash;
    expect(ha).toEqual(hb);
  });

  it('returns different hashes for differing manifests', async () => {
    const a = await hashManifest({ manifest: validManifest });
    const b = await hashManifest({
      manifest: { ...validManifest, version: '1.0.1' },
    });
    const ha = JSON.parse(a.content[0]!.text).data.hash;
    const hb = JSON.parse(b.content[0]!.text).data.hash;
    expect(ha).not.toEqual(hb);
  });
});

describe('submit_manifest handler', () => {
  it('returns state:submitted with hash and warnings for a valid manifest', async () => {
    const result = await submitManifest({ manifest: validManifest });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.state).toBe('submitted');
    expect(payload.data.hash).toBeDefined();
    expect(payload.data.manifestId).toBe(validManifest.id);
    expect(Array.isArray(payload.data.warnings)).toBe(true);
  });

  it('returns isError:true with errors[] for an invalid manifest', async () => {
    const bad = {
      ...validManifest,
      permissions: [
        {
          ...validManifest.permissions[0]!,
          reason: 'short', // Too few words for reason
        },
      ],
    };
    const result = await submitManifest({ manifest: bad as unknown as CapabilityManifest });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toHaveProperty('code');
    expect(payload.errors[0]).toHaveProperty('fixHint');
  });
});

describe('approve_manifest handler', () => {
  it('returns state:approved with hash and manifestId for a valid submission and approval', async () => {
    const result = await approveManifest({
      manifest: validManifest,
      approver: 'alice@example.com',
    });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.state).toBe('approved');
    expect(payload.data.hash).toBeDefined();
    expect(payload.data.manifestId).toBe(validManifest.id);
  });

  it('returns isError:true with errors[] for an invalid manifest', async () => {
    const bad = {
      ...validManifest,
      permissions: [
        {
          ...validManifest.permissions[0]!,
          reason: 'short', // Too few words for reason
        },
      ],
    };
    const result = await approveManifest({
      manifest: bad as unknown as CapabilityManifest,
      approver: 'alice@example.com',
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toHaveProperty('code');
    expect(payload.errors[0]).toHaveProperty('fixHint');
  });
});

describe('audit_events handler', () => {
  it('returns an empty events array for a manifest with no recorded transports', async () => {
    const result = await auditEvents({ manifest: validManifest });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.events)).toBe(true);
    expect(payload.data.events.length).toBe(0);
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
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.recording.entries).toHaveLength(2);
  });
});

describe('replay handler', () => {
  it('returns ok:true with {result} when replay matches the recording', async () => {
    const { record, replay } = await import('../../tools/mcp/handlers.js');
    const recorded = await record({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'k', value: 'v' } },
      ],
    });
    const recording = JSON.parse(recorded.content[0]!.text).data.recording;

    const result = await replay({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      recording,
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'k', value: 'v' } },
      ],
    });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.result).toBeDefined();
    expect(payload.data.divergence).toBeUndefined();
  });

  it('returns ok:true with {divergence} when the recording diverges (finding, not failure)', async () => {
    // Divergence is a FINDING, not a tool failure: the replay successfully
    // detected the mismatch. It lives in the success arm of the tagged
    // union; isError stays unset.
    const { record, replay } = await import('../../tools/mcp/handlers.js');
    const recorded = await record({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'a', value: '1' } },
      ],
    });
    const recording = JSON.parse(recorded.content[0]!.text).data.recording;

    const result = await replay({
      manifest: validManifest,
      actionId: 'noop',
      input: {},
      recording,
      capability_calls: [
        { kind: 'storage.put', input: { scope: 'cache', key: 'b', value: '2' } },
      ],
    });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.divergence).toBeDefined();
    expect(payload.data.divergence.code).toMatch(/replay/);
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
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(true);
    expect(payload.data.formatted).toBe('[test.bad] somewhere: expected good, got bad — fix it');
  });
});
