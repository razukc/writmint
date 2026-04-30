import { describe, it, expect } from 'vitest';
import { Runtime } from '../../src/index.js';
import { ActionExecutionError, ActionTimeoutError, type PluginDefinition } from '../../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeRuntime(plugin: PluginDefinition) {
  const r = new Runtime();
  r.registerPlugin(plugin);
  await r.initialize();
  return r;
}

// ─── Execution Recorder ───────────────────────────────────────────────────────

describe('ctx.trace (ExecutionRecorder)', () => {
  it('is accessible on the context', async () => {
    const r = new Runtime();
    await r.initialize();
    expect(r.getContext().trace).toBeDefined();
    expect(typeof r.getContext().trace.getEntries).toBe('function');
    await r.shutdown();
  });

  it('records a successful action run', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:greet', handler: () => 'hello' });
      }
    });
    await r.getContext().actions.runAction('test:greet');
    const entries = r.getContext().trace.getEntries();
    expect(entries.length).toBe(1);
    const e = entries[0];
    expect(e.actionId).toBe('test:greet');
    expect(e.status).toBe('success');
    expect(e.output).toBe('hello');
    expect(e.durationMs).toBeGreaterThanOrEqual(0);
    expect(e.startedAt).toBeTypeOf('number');
    expect(e.runId).toMatch(/^run_/);
    expect(e.attempt).toBe(1);
    await r.shutdown();
  });

  it('records input params', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:echo', handler: (p: any) => p.msg });
      }
    });
    await r.getContext().actions.runAction('test:echo', { msg: 'hi' });
    const e = r.getContext().trace.getEntries()[0];
    expect(e.input).toEqual({ msg: 'hi' });
    await r.shutdown();
  });

  it('records a failed action run with status "error"', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:fail', handler: () => { throw new Error('boom'); } });
      }
    });
    await expect(r.getContext().actions.runAction('test:fail')).rejects.toThrow();
    const entries = r.getContext().trace.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('error');
    expect(entries[0].error).toContain('boom');
    expect(entries[0].output).toBeUndefined();
    await r.shutdown();
  });

  it('records a timed-out action with status "timeout"', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:slow',
          timeout: 20,
          handler: async () => { await new Promise(res => setTimeout(res, 500)); }
        });
      }
    });
    await expect(r.getContext().actions.runAction('test:slow')).rejects.toThrow(ActionTimeoutError);
    const entries = r.getContext().trace.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('timeout');
    await r.shutdown();
  });

  it('records each retry attempt separately', async () => {
    let calls = 0;
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:retry',
          retry: 2,
          handler: () => {
            calls++;
            if (calls < 3) throw new Error('not yet');
            return 'done';
          }
        });
      }
    });
    await r.getContext().actions.runAction('test:retry');
    const entries = r.getContext().trace.getEntries();
    // 2 error attempts + 1 success
    expect(entries.length).toBe(3);
    expect(entries[0].status).toBe('error');
    expect(entries[0].attempt).toBe(1);
    expect(entries[1].status).toBe('error');
    expect(entries[1].attempt).toBe(2);
    expect(entries[2].status).toBe('success');
    expect(entries[2].attempt).toBe(3);
    await r.shutdown();
  });

  it('getEntriesFor filters by actionId', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:a', handler: () => 'a' });
        ctx.actions.registerAction({ id: 'test:b', handler: () => 'b' });
      }
    });
    await r.getContext().actions.runAction('test:a');
    await r.getContext().actions.runAction('test:b');
    await r.getContext().actions.runAction('test:a');

    const aEntries = r.getContext().trace.getEntriesFor('test:a');
    expect(aEntries.length).toBe(2);
    expect(aEntries.every(e => e.actionId === 'test:a')).toBe(true);

    const bEntries = r.getContext().trace.getEntriesFor('test:b');
    expect(bEntries.length).toBe(1);
    await r.shutdown();
  });

  it('trace entries are frozen', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:freeze', handler: () => 42 });
      }
    });
    await r.getContext().actions.runAction('test:freeze');
    const entry = r.getContext().trace.getEntries()[0];
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => { (entry as any).status = 'hacked'; }).toThrow();
    await r.shutdown();
  });

  it('each runId is unique', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:id', handler: () => {} });
      }
    });
    await r.getContext().actions.runAction('test:id');
    await r.getContext().actions.runAction('test:id');
    const entries = r.getContext().trace.getEntries();
    const ids = entries.map(e => e.runId);
    expect(new Set(ids).size).toBe(ids.length);
    await r.shutdown();
  });

  it('clear() empties the log', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:clear', handler: () => {} });
      }
    });
    await r.getContext().actions.runAction('test:clear');
    expect(r.getContext().trace.getEntries().length).toBe(1);
    r.getContext().trace.clear();
    expect(r.getContext().trace.getEntries().length).toBe(0);
    await r.shutdown();
  });

  it('getEntries returns a snapshot (not live reference)', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:snap', handler: () => {} });
      }
    });
    await r.getContext().actions.runAction('test:snap');
    const snapshot = r.getContext().trace.getEntries();
    await r.getContext().actions.runAction('test:snap');
    // snapshot should not have grown
    expect(snapshot.length).toBe(1);
    expect(r.getContext().trace.getEntries().length).toBe(2);
    await r.shutdown();
  });

  it('respects maxEntries cap (default 1000)', async () => {
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:cap', handler: () => {} });
      }
    });
    // Run 1010 times
    for (let i = 0; i < 1010; i++) {
      await r.getContext().actions.runAction('test:cap');
    }
    expect(r.getContext().trace.getEntries().length).toBeLessThanOrEqual(1000);
    await r.shutdown();
  });
});
