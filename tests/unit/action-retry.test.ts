import { describe, it, expect, vi } from 'vitest';
import { Runtime } from '../../src/index.js';
import { ActionExecutionError, ActionMemoryError, type PluginDefinition } from '../../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRuntime(plugin: PluginDefinition) {
  const r = new Runtime();
  r.registerPlugin(plugin);
  return r;
}

// ─── Retry ────────────────────────────────────────────────────────────────────

describe('Action retry', () => {
  it('succeeds on first attempt when no retry needed', async () => {
    let calls = 0;
    const r = await makeRuntime({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:ok',
          handler: () => { calls++; return 'done'; }
        });
      }
    });
    await r.initialize();
    const result = await r.getContext().actions.runAction('test:ok');
    expect(result).toBe('done');
    expect(calls).toBe(1);
    await r.shutdown();
  });

  it('retries the specified number of times on failure', async () => {
    let calls = 0;
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:flaky',
          retry: 2,
          handler: () => {
            calls++;
            if (calls < 3) throw new Error('not yet');
            return 'ok';
          }
        });
      }
    });
    await r.initialize();
    const result = await r.getContext().actions.runAction('test:flaky');
    expect(result).toBe('ok');
    expect(calls).toBe(3); // 1 initial + 2 retries
    await r.shutdown();
  });

  it('throws ActionExecutionError after all retries exhausted', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:always-fail',
          retry: 1,
          handler: () => { throw new Error('always'); }
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:always-fail'))
      .rejects.toThrow(ActionExecutionError);
    await r.shutdown();
  });

  it('does not retry on ActionTimeoutError', async () => {
    let calls = 0;
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:timeout',
          timeout: 20,
          retry: 3,
          handler: async () => {
            calls++;
            await new Promise(res => setTimeout(res, 200));
          }
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:timeout')).rejects.toThrow();
    expect(calls).toBe(1); // no retries
    await r.shutdown();
  });

  it('retry: 0 is the same as no retry', async () => {
    let calls = 0;
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:zero-retry',
          retry: 0,
          handler: () => { calls++; throw new Error('fail'); }
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:zero-retry')).rejects.toThrow(ActionExecutionError);
    expect(calls).toBe(1);
    await r.shutdown();
  });

  it('introspection surfaces retry field', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:meta', retry: 3, handler: () => {} });
      }
    });
    await r.initialize();
    const meta = r.getContext().introspect.getActionDefinition('test:meta');
    expect(meta?.retry).toBe(3);
    await r.shutdown();
  });
});

// ─── Memory limit ─────────────────────────────────────────────────────────────

describe('Action memoryLimitMb', () => {
  it('does not throw when memory usage is within limit', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:light',
          memoryLimitMb: 500, // very generous
          handler: () => 'ok'
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:light')).resolves.toBe('ok');
    await r.shutdown();
  });

  it('throws ActionMemoryError when heap delta exceeds limit', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:heavy',
          memoryLimitMb: 0, // 0 MB — any allocation will exceed this
          handler: () => {
            // Allocate ~1MB to ensure delta > 0
            const arr = new Array(1024 * 128).fill('x');
            return arr.length;
          }
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:heavy'))
      .rejects.toThrow(ActionMemoryError);
    await r.shutdown();
  });

  it('ActionMemoryError carries actionId, limitMb, usedMb', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:mem-meta',
          memoryLimitMb: 0,
          handler: () => new Array(1024 * 128).fill('x')
        });
      }
    });
    await r.initialize();
    try {
      await r.getContext().actions.runAction('test:mem-meta');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ActionMemoryError);
      const err = e as ActionMemoryError;
      expect(err.actionId).toBe('test:mem-meta');
      expect(err.limitMb).toBe(0);
      expect(err.usedMb).toBeTypeOf('number');
    }
    await r.shutdown();
  });

  it('does not retry on ActionMemoryError', async () => {
    let calls = 0;
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({
          id: 'test:mem-no-retry',
          memoryLimitMb: 0,
          retry: 3,
          handler: () => { calls++; return new Array(1024 * 128).fill('x'); }
        });
      }
    });
    await r.initialize();
    await expect(r.getContext().actions.runAction('test:mem-no-retry'))
      .rejects.toThrow(ActionMemoryError);
    expect(calls).toBe(1);
    await r.shutdown();
  });

  it('introspection surfaces memoryLimitMb field', async () => {
    const r = new Runtime();
    r.registerPlugin({
      name: 'p', version: '1.0.0',
      setup(ctx) {
        ctx.actions.registerAction({ id: 'test:mem-meta2', memoryLimitMb: 64, handler: () => {} });
      }
    });
    await r.initialize();
    const meta = r.getContext().introspect.getActionDefinition('test:mem-meta2');
    expect(meta?.memoryLimitMb).toBe(64);
    await r.shutdown();
  });
});
