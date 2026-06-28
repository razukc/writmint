import { describe, it, expect } from 'vitest';
import { toAttemptResult, replayAttempts, type AttemptRecord } from '../../fixtures/dogfood-corpus/replay.js';

describe('toAttemptResult', () => {
  it('narrows a verifyManifest result to code+where pairs', () => {
    const v = {
      valid: false,
      errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion', expected: '1', actual: 'undefined', fixHint: 'x' }],
      warnings: [],
    };
    expect(toAttemptResult(v)).toEqual({
      valid: false,
      errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion' }],
    });
  });
});

describe('replayAttempts', () => {
  it('runs drafts through the live validator and converges on a valid manifest', () => {
    // a minimal but actually-valid manifest accepted by the live verifyManifest
    const validManifest = {
      schemaVersion: 1,
      id: 'ops.noop',
      title: 'Noop',
      version: '0.1.0',
      description: 'A pure action that does nothing external at all, for testing.',
      permissions: [],
      actions: [
        {
          id: 'noop',
          description: 'Do nothing and return an empty object, purely for tests.',
          handler: 'noop',
          destructive: false,
          permissions: [],
          input: { type: 'object', properties: {}, required: [] },
          output: { type: 'object', properties: {}, required: [] },
        },
      ],
      implementation: { type: 'module', entry: './impl.js' },
    };
    const attempts: AttemptRecord[] = [
      { n: 1, manifest: { id: 'ops.noop' } }, // structurally incomplete -> refused
      { n: 2, manifest: validManifest },       // -> accepted
    ];
    const { results, drift } = replayAttempts(attempts);
    expect(results[0].valid).toBe(false);
    expect(results[1].valid).toBe(true);
    expect(drift).toEqual([]); // no expected blocks -> no drift
  });

  it('records drift when a recorded expected disagrees with the live result', () => {
    const attempts: AttemptRecord[] = [
      { n: 1, manifest: { id: 'ops.noop' }, expected: { valid: true, codes: [] } }, // lie: it is actually invalid
    ];
    const { drift } = replayAttempts(attempts);
    expect(drift).toHaveLength(1);
    expect(drift[0].n).toBe(1);
    expect(drift[0].got.valid).toBe(false);
  });
});
