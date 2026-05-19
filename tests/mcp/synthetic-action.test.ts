import { describe, it, expect } from 'vitest';
import { buildSyntheticAction } from '../../tools/mcp/synthetic-action.js';
import type { HostTransports } from '../../src/permissions.js';

describe('buildSyntheticAction', () => {
  it('executes a sequence of network and storage calls in order', async () => {
    const log: string[] = [];
    const transports: HostTransports = {
      network: {
        async request(input) {
          log.push(`net:${input.url}`);
          return { status: 200, body: 'ok', headers: {} };
        },
      },
      storage: {
        async get(scope, key) { log.push(`get:${scope}:${key}`); return 'v'; },
        async put(scope, key, value) { log.push(`put:${scope}:${key}:${value}`); },
        async delete(scope, key) { log.push(`del:${scope}:${key}`); },
        async list(scope, prefix) { log.push(`list:${scope}:${prefix ?? ''}`); return []; },
      },
    };
    const action = buildSyntheticAction([
      { kind: 'network.request', input: { url: 'https://a', method: 'GET', headers: {} } },
      { kind: 'storage.get', input: { scope: 's', key: 'k' } },
      { kind: 'storage.put', input: { scope: 's', key: 'k', value: 'v2' } },
    ]);
    const outputs = await action(transports);
    expect(log).toEqual([
      'net:https://a',
      'get:s:k',
      'put:s:k:v2',
    ]);
    expect(outputs).toHaveLength(3);
  });

  it('throws StructuredError on unknown call kind', async () => {
    const action = buildSyntheticAction([
      { kind: 'bogus.kind', input: {} } as unknown as any,
    ]);
    const transports: HostTransports = {};
    await expect(action(transports)).rejects.toThrow(/synthetic_action/);
  });

  it('throws StructuredError when the required transport is missing', async () => {
    const action = buildSyntheticAction([
      { kind: 'storage.get', input: { scope: 's', key: 'k' } },
    ]);
    const transports: HostTransports = {}; // no storage
    await expect(action(transports)).rejects.toThrow(/missing_transport/);
  });
});
