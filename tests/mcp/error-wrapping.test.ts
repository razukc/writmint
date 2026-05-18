import { describe, it, expect } from 'vitest';
import { wrapStructured, divergenceToPayload } from '../../tools/mcp/errors.js';
import { RuntimeError, ReplayDivergenceError } from '../../src/index.js';

describe('wrapStructured', () => {
  it('returns the raw result on success', async () => {
    const result = await wrapStructured(async () => ({ value: 42 }));
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ value: 42 }) }],
    });
  });

  it('returns isError:true with structured payload on StructuredError', async () => {
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
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual(structured);
  });

  it('rethrows plain Error so MCP transport surfaces it', async () => {
    await expect(
      wrapStructured(async () => {
        throw new Error('plain');
      })
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
