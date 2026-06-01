import { describe, it, expect } from 'vitest';
import { wrapStructured, divergenceToPayload } from '../../tools/mcp/errors.js';
import { RuntimeError, ReplayDivergenceError } from '../../src/index.js';

describe('wrapStructured', () => {
  it('wraps a successful result in { ok:true, data }', async () => {
    const result = await wrapStructured(async () => ({ value: 42 }));
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toEqual(
      JSON.stringify({ ok: true, data: { value: 42 } }),
    );
  });

  it('wraps a StructuredError throw in isError:true + { ok:false, errors:[...] }', async () => {
    const structured = {
      code: 'test.bad',
      where: 'somewhere',
      expected: 'good',
      actual: 'bad',
      fixHint: 'fix it',
    };
    const result = await wrapStructured(async () => {
      throw new RuntimeError(structured);
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(false);
    expect(payload.errors).toEqual([structured]);
  });

  it('pulls every error when the thrower batches via allErrors', async () => {
    // v0.3.2 contract: RuntimeError / ApprovalError / any throw carrying an
    // `allErrors: StructuredError[]` field surfaces all entries on the wire.
    // Pre-v0.3.2 callers only saw `structured` (the first one). See
    // verifyManifest + ApprovalError.allErrors in v0.3.1.
    const e1 = {
      code: 'test.first',
      where: '$.a',
      expected: 'a',
      actual: 'b',
      fixHint: 'fix a',
    };
    const e2 = {
      code: 'test.second',
      where: '$.b',
      expected: 'c',
      actual: 'd',
      fixHint: 'fix b',
    };
    const result = await wrapStructured(async () => {
      throw new RuntimeError(e1, [e1, e2]);
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.ok).toBe(false);
    expect(payload.errors).toEqual([e1, e2]);
  });

  it('rethrows plain Error so MCP transport surfaces it', async () => {
    await expect(
      wrapStructured(async () => {
        throw new Error('plain');
      }),
    ).rejects.toThrow('plain');
  });
});

describe('divergenceToPayload', () => {
  it('extracts the structured field from a ReplayDivergenceError', () => {
    const structured = {
      code: 'replay.divergence',
      where: 'recording.entries[0]',
      expected: 'storage.get(x,y)',
      actual: 'network.request',
      fixHint: 'Re-record after the change.',
    };
    const err = new ReplayDivergenceError(structured);
    expect(divergenceToPayload(err)).toEqual(structured);
  });
});
