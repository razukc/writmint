import { describe, it, expect } from 'vitest';
import { validateManifest, hashManifest } from '../../tools/mcp/handlers.js';
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
