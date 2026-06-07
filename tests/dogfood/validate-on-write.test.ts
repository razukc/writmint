import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateProposedManifest,
  computeProposedContents,
} from '../../tools/dogfood/validate-on-write.js';

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
    it('returns ok:true silently when JSON has no schemaVersion: 1 marker', () => {
      const notAManifest = JSON.stringify({ name: 'something', version: '1' });
      const result = validateProposedManifest(notAManifest, 'manifest.json');
      expect(result.ok).toBe(true);
    });

    it('returns ok:true silently for JSON with no manifest-shape markers (e.g. a stray { capabilities: [] })', () => {
      // The exact false-positive shape the user caught in dogfood verify:
      // `{ "capabilities": [], "id": "" }`. `capabilities` is not a real
      // v1 manifest field — without schemaVersion/permissions/actions/
      // implementation, we don't treat the file as a manifest attempt and
      // pass silently. The OLD discriminator (`'capabilities' in parsed`)
      // would have validated this, which was a bug: real manifests have
      // `permissions[]`, not `capabilities[]`, so the OLD logic would
      // have skipped real manifests and only flagged junk.
      const notAManifest = JSON.stringify({ capabilities: [], id: '' });
      const result = validateProposedManifest(notAManifest, 'manifest.json');
      expect(result.ok).toBe(true);
    });

    it('treats JSON with any manifest shape marker as a manifest attempt', () => {
      // Partial / typo'd manifest — agent wrote `actions: []` but forgot
      // the rest. Catch it and surface what's missing, rather than pass
      // silently.
      const partial = JSON.stringify({ actions: [] });
      const result = validateProposedManifest(partial, 'manifest.json');
      expect(result.ok).toBe(false);
    });

    it('returns ok:true silently when TS source has no capabilities marker', () => {
      const tsSource = 'export const config = { name: "foo" };';
      const result = validateProposedManifest(tsSource, 'manifest.ts');
      expect(result.ok).toBe(true);
    });
  });

  describe('non-manifest filenames (filename gate)', () => {
    it('passes settings files silently even when they carry a permissions key', () => {
      // Live false positive (2026-06-07): .claude/settings.local.json has a
      // `permissions` shape marker and was denied as a broken manifest.
      const settings = JSON.stringify({ permissions: { allow: ['Bash(node *)'] } });
      const result = validateProposedManifest(
        settings,
        'C:\\code\\playground\\runtime\\.claude\\settings.local.json',
      );
      expect(result.ok).toBe(true);
    });

    it('still validates dotted manifest names like feature.manifest.jsonc', () => {
      const result = validateProposedManifest(
        JSON.stringify({ actions: [] }),
        '/repo/feature.manifest.jsonc',
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('non-JSON extensions (extension gate)', () => {
    // The extension gate runs BEFORE JSON.parse so non-JSON files never
    // produce a manifest.parse_error. This guards against the dogfood-pass-01
    // bug where markdown writes (README.md, SKILL.md, memory files) emitted
    // structured rejections because parse ran before any shape check.

    it('returns ok:true silently for TS files (parse not attempted)', () => {
      const tsSource = `export const manifest = { id: 'feature.foo' };`;
      const result = validateProposedManifest(tsSource, 'manifest.ts');
      expect(result.ok).toBe(true);
    });

    it('returns ok:true silently for markdown files (parse not attempted)', () => {
      const md = '# Some heading\n\nNot JSON. Parse would fail.';
      const result = validateProposedManifest(md, 'README.md');
      expect(result.ok).toBe(true);
    });

    it('returns ok:true silently for JS files (parse not attempted)', () => {
      const js = 'module.exports = { foo: 1 }; // not JSON';
      const result = validateProposedManifest(js, 'script.js');
      expect(result.ok).toBe(true);
    });

    it('is case-insensitive on the extension', () => {
      const result = validateProposedManifest('# heading', 'README.MD');
      expect(result.ok).toBe(true);
    });

    it('still validates .json files (the gate does not skip the happy path)', () => {
      const result = validateProposedManifest(INVALID_MANIFEST, 'manifest.json');
      expect(result.ok).toBe(false);
    });
  });
});

describe('computeProposedContents', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'writmint-hook-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns Write content verbatim as the proposed source', () => {
    const result = computeProposedContents({
      tool_name: 'Write',
      tool_input: {
        file_path: join(dir, 'manifest.json'),
        content: '{"capabilities":[]}',
      },
    });
    expect(result.kind).toBe('validate');
    if (result.kind === 'validate') {
      expect(result.source).toBe('{"capabilities":[]}');
      expect(result.filePath).toBe(join(dir, 'manifest.json'));
    }
  });

  it('returns Edit proposed contents by applying the substitution to the on-disk file', () => {
    const filePath = join(dir, 'manifest.json');
    writeFileSync(filePath, '{"id":"old","capabilities":[]}', 'utf8');

    const result = computeProposedContents({
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: '"id":"old"',
        new_string: '"id":"new"',
      },
    });
    expect(result.kind).toBe('validate');
    if (result.kind === 'validate') {
      expect(result.source).toBe('{"id":"new","capabilities":[]}');
    }
  });

  it('returns Edit proposed contents with replace_all when set', () => {
    const filePath = join(dir, 'manifest.json');
    writeFileSync(filePath, 'a-a-a', 'utf8');

    const result = computeProposedContents({
      tool_name: 'Edit',
      tool_input: {
        file_path: filePath,
        old_string: 'a',
        new_string: 'b',
        replace_all: true,
      },
    });
    expect(result.kind).toBe('validate');
    if (result.kind === 'validate') {
      expect(result.source).toBe('b-b-b');
    }
  });

  it('returns skip for tools other than Write/Edit', () => {
    const result = computeProposedContents({
      tool_name: 'Bash',
      tool_input: { file_path: '/whatever' },
    });
    expect(result.kind).toBe('skip');
  });

  it('returns skip when tool_input has no file_path', () => {
    const result = computeProposedContents({ tool_name: 'Write', tool_input: {} });
    expect(result.kind).toBe('skip');
  });

  it('returns skip for Edit when the file does not exist (ENOENT)', () => {
    const result = computeProposedContents({
      tool_name: 'Edit',
      tool_input: {
        file_path: join(dir, 'does-not-exist.json'),
        old_string: 'x',
        new_string: 'y',
      },
    });
    expect(result.kind).toBe('skip');
  });
});
