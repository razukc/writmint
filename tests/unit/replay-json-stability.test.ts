import { describe, it, expect } from 'vitest';
import { record, replay } from '../../src/replay.js';
import type { HostTransports } from '../../src/permissions.js';

// The MCP server transports recordings as JSON over stdio. Any recording that
// is not JSON-stable (i.e., `JSON.parse(JSON.stringify(x))` is not equal to
// `x` under the replay comparator) will diverge after a wire round-trip even
// when the capability is replayed identically. The fix is to canonicalize
// recorded inputs through a JSON round-trip at record time so the in-memory
// recording matches whatever the wire delivers.

function makeAuditTransports(): HostTransports {
  return {
    audit: {
      emit() {
        /* no-op */
      },
    },
  };
}

function wireRoundTrip<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

describe('replay recordings survive a JSON wire round-trip', () => {
  it('audit.emit with no payload replays cleanly after JSON round-trip', async () => {
    const base = makeAuditTransports();
    const { recording } = await record(base, async (t) => {
      t.audit!.emit({
        permissionId: 'audit:default',
        name: 'tagged',
        at: 0,
      });
    });

    const wired = wireRoundTrip(recording);

    await expect(
      replay(wired, async (t) => {
        t.audit!.emit({
          permissionId: 'audit:default',
          name: 'tagged',
          at: 0,
        });
      })
    ).resolves.toMatchObject({ entries: expect.any(Array) });
  });

  it('audit.emit called with a non-envelope payload replays cleanly after JSON round-trip', async () => {
    // This is the shape the MCP synthetic broker produces when the agent
    // passes `{kind: "audit.emit", input: <payload-fields>}` — synthetic-action
    // forwards `input` straight to `t.audit.emit(input)` without wrapping it
    // in a {permissionId, name, payload} envelope. Result: event.permissionId
    // and event.name are both undefined.
    const base = makeAuditTransports();
    const { recording } = await record(base, async (t) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t.audit!.emit as unknown as (e: any) => void)({
        amount: 12500,
        txn_id: 'txn-0001',
      });
    });

    const wired = wireRoundTrip(recording);

    await expect(
      replay(wired, async (t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t.audit!.emit as unknown as (e: any) => void)({
          amount: 12500,
          txn_id: 'txn-0001',
        });
      })
    ).resolves.toMatchObject({ entries: expect.any(Array) });
  });

  it('storage.list with no prefix replays cleanly after JSON round-trip', async () => {
    const store = new Map<string, unknown>();
    const base: HostTransports = {
      storage: {
        async get(scope, key) {
          return store.get(`${scope}:${key}`);
        },
        async put(scope, key, value) {
          store.set(`${scope}:${key}`, value);
        },
        async delete(scope, key) {
          store.delete(`${scope}:${key}`);
        },
        async list(scope) {
          const p = `${scope}:`;
          return Array.from(store.keys())
            .filter((k) => k.startsWith(p))
            .map((k) => k.slice(p.length));
        },
      },
    };

    const { recording } = await record(base, async (t) => {
      await t.storage!.list('cache');
    });

    const wired = wireRoundTrip(recording);

    await expect(
      replay(wired, async (t) => {
        await t.storage!.list('cache');
      })
    ).resolves.toMatchObject({ entries: expect.any(Array) });
  });
});
