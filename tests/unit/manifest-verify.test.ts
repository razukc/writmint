import { describe, it, expect } from 'vitest';
import { verifyManifest, type CapabilityManifest } from '../../src/capability-manifest.js';

// verifyManifest combines structural validation and hardening into a single
// pass that returns ALL errors and warnings the input produces, instead of
// short-circuiting between stages. The contract:
//
//   - Structural errors are always exhaustive (validateCapabilityManifest
//     already collects, doesn't fail-fast).
//   - Hardening runs even when structural has errors, but skips subtrees
//     that are too broken to harden meaningfully (actions[i] that isn't
//     an object, permissions[i] that isn't an object, missing arrays).
//   - The result combines both: valid = structural+hardening both clean,
//     errors = structural errors + hardening errors that survived, warnings
//     = hardening warnings that survived.
//
// Raised by dogfood pass 06/06b: a manifest with both structural and
// hardening violations costs 2 round-trips because the validator pipeline
// short-circuits between stages. verifyManifest drops the ceiling to 1.

function baseManifest(): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.example',
    version: '0.1.0',
    title: 'Example',
    description: 'A capability used in verifyManifest tests.',
    permissions: [
      {
        type: 'storage',
        id: 'store.cache',
        scope: 'example/items',
        mode: 'readwrite',
        reason: 'Used by example.run to read and write cached items.',
      },
    ],
    actions: [
      {
        id: 'example.run',
        description: 'A non-destructive action used by verify tests.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['store.cache'],
        handler: 'run',
      },
    ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

describe('verifyManifest — clean manifest', () => {
  it('returns valid:true, no errors, no warnings', () => {
    const r = verifyManifest(baseManifest());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe('verifyManifest — structural only', () => {
  it('returns structural errors and no warnings when structural alone fails', () => {
    const m = baseManifest() as Record<string, unknown>;
    delete m.id;
    const r = verifyManifest(m);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'string.required' && e.where === '$.id')).toBe(true);
  });
});

describe('verifyManifest — hardening only', () => {
  it('returns hardening errors and warnings when structure is clean', () => {
    const m = baseManifest();
    m.permissions[0]!.reason = 'too short';
    const r = verifyManifest(m);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'permission.reason.too_short')).toBe(true);
  });

  it('returns hardening warnings even when no errors', () => {
    const m = baseManifest();
    (m as Record<string, unknown>).strayField = 'oops';
    const r = verifyManifest(m);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.code === 'manifest.unknown_field')).toBe(true);
  });
});

describe('verifyManifest — combined (the value proposition)', () => {
  it('returns BOTH structural and hardening errors in a single call', () => {
    // The pass 06 case: structural and hardening violations on the same
    // manifest. Pre-verifyManifest this cost 2 round-trips. Now it costs 1.
    const m = baseManifest() as Record<string, unknown>;
    delete m.title; // structural: string.required
    (m as { permissions: unknown[] }).permissions = [
      {
        type: 'network',
        id: 'net.api',
        hosts: ['*.example.com'], // hardening: host_wildcard
        methods: ['GET'],
        reason: 'Used by example.run to call the external API.',
      },
    ];
    (m as { actions: unknown[] }).actions = [
      {
        id: 'example.run',
        description: 'A clean action description for this test scenario.',
        input: { type: 'object' },
        output: { type: 'object' },
        permissions: ['net.api'],
        handler: 'run',
      },
    ];

    const r = verifyManifest(m);

    expect(r.valid).toBe(false);
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain('string.required'); // structural
    expect(codes).toContain('permission.network.host_wildcard'); // hardening
  });

  it('skips hardening on broken subtrees but runs it on the rest', () => {
    // actions[0] is malformed (not an object) — structural will reject it.
    // permissions[0] is clean structurally but has a wildcard host —
    // hardening should still catch that even though actions are broken.
    const m: Record<string, unknown> = {
      schemaVersion: 1,
      id: 'ops.partial',
      version: '0.1.0',
      title: 'Partial',
      description: 'A capability with one broken subtree and one harden-able subtree.',
      permissions: [
        {
          type: 'network',
          id: 'net.api',
          hosts: ['*.example.com'],
          methods: ['GET'],
          reason: 'Used by example.run to call the external API safely.',
        },
      ],
      actions: ['not an object'], // structural failure
      implementation: { type: 'module', entry: './impl.js' },
    };
    const r = verifyManifest(m);
    expect(r.valid).toBe(false);
    // Structural error on actions
    expect(
      r.errors.some((e) => e.code === 'action.not_object' || e.where.startsWith('$.actions[')),
    ).toBe(true);
    // Hardening error on permissions (NOT skipped — that subtree was fine)
    expect(r.errors.some((e) => e.code === 'permission.network.host_wildcard')).toBe(true);
  });

  it('skips hardening on a non-object permission entry but checks the others', () => {
    const m = baseManifest() as Record<string, unknown>;
    (m.permissions as unknown[]) = [
      'not an object', // structural failure at permissions[0]
      {
        type: 'storage',
        id: 'store.cache',
        scope: 'example/*', // hardening wildcard at permissions[1]
        mode: 'readwrite',
        reason: 'Used by example.run to read and write cached items via this scope.',
      },
    ];
    // make sure actions reference the surviving permission so it's not orphaned
    (m.actions as Array<Record<string, unknown>>)[0]!.permissions = ['store.cache'];

    const r = verifyManifest(m);
    expect(r.valid).toBe(false);
    expect(
      r.errors.some(
        (e) =>
          e.where === '$.permissions[1].scope' && e.code === 'permission.storage.scope_wildcard',
      ),
    ).toBe(true);
  });

  it('returns warnings even when there are also errors', () => {
    // Unknown field at top-level (warning) + missing title (error).
    const m = baseManifest() as Record<string, unknown>;
    delete m.title;
    m.strayField = 'oops';
    const r = verifyManifest(m);
    expect(r.valid).toBe(false);
    expect(r.warnings.some((w) => w.code === 'manifest.unknown_field')).toBe(true);
    expect(r.errors.some((e) => e.code === 'string.required')).toBe(true);
  });
});

describe('verifyManifest — input type', () => {
  it('accepts unknown input and rejects non-objects with manifest.not_object', () => {
    const r = verifyManifest(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0]!.code).toBe('manifest.not_object');
    expect(r.warnings).toEqual([]);
  });
});
