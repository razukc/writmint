import { describe, it, expect } from 'vitest';
import { validateProposedManifest } from '../../tools/dogfood/validate-on-write.js';

const VALID_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  id: 'ops.dogfood-test',
  version: '0.1.0',
  title: 'Test',
  description: 'Test manifest for the hook',
  permissions: [
    {
      type: 'network',
      id: 'net.test',
      hosts: ['api.example.com'],
      methods: ['GET'],
      reason: 'Test permission for the hook',
    },
  ],
  actions: [
    {
      id: 'dogfood.test',
      description: 'Test action for the hook',
      input: { type: 'object' },
      output: { type: 'object' },
      permissions: ['net.test'],
      handler: 'test',
    },
  ],
  implementation: { type: 'module', entry: './impl.js' },
  capabilities: [],
});

const INVALID_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  id: '',
  version: '0.1.0',
  title: 'Test',
  description: 'Bad — empty id',
  permissions: [
    {
      type: 'network',
      id: 'net.test',
      hosts: ['api.example.com'],
      methods: ['GET'],
      reason: 'Test permission for the hook',
    },
  ],
  actions: [
    {
      id: 'dogfood.test',
      description: 'Test action for the hook',
      input: { type: 'object' },
      output: { type: 'object' },
      permissions: ['net.test'],
      handler: 'test',
    },
  ],
  implementation: { type: 'module', entry: './impl.js' },
  capabilities: [],
});

describe('validateProposedManifest', () => {
  describe('JSON inputs', () => {
    it('returns ok:true for a valid manifest', () => {
      const result = validateProposedManifest(VALID_MANIFEST, 'manifest.json');
      expect(result.ok).toBe(true);
    });

    it('returns ok:false with errors for an invalid manifest', () => {
      const result = validateProposedManifest(INVALID_MANIFEST, 'manifest.json');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toHaveProperty('code');
        expect(result.errors[0]).toHaveProperty('where');
      }
    });

    it('returns ok:false with a parse-error structured shape for malformed JSON', () => {
      const result = validateProposedManifest('{not json', 'manifest.json');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].code).toBe('manifest.parse_error');
      }
    });
  });

  describe('non-manifest files (false-positive defense)', () => {
    it('returns ok:true silently when JSON has no capabilities field', () => {
      const notAManifest = JSON.stringify({ name: 'something', version: '1' });
      const result = validateProposedManifest(notAManifest, 'manifest.json');
      expect(result.ok).toBe(true);
    });

    it('returns ok:true silently when TS source has no capabilities marker', () => {
      const tsSource = 'export const config = { name: "foo" };';
      const result = validateProposedManifest(tsSource, 'manifest.ts');
      expect(result.ok).toBe(true);
    });
  });

  describe('TS inputs', () => {
    it('returns ok:true silently for TS files (cannot evaluate safely)', () => {
      const tsSource = `
        export const manifest = {
          id: 'feature.foo',
          capabilities: [],
        };
      `;
      const result = validateProposedManifest(tsSource, 'manifest.ts');
      expect(result.ok).toBe(true);
    });
  });
});
