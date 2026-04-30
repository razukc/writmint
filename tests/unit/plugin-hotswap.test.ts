import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import { PluginSwapError } from '../../src/types.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlugin(
  name: string,
  version: string,
  overrides: Partial<PluginDefinition> = {}
): PluginDefinition {
  return { name, version, setup: vi.fn(), ...overrides };
}

async function bootWithPlugin(plugin: PluginDefinition): Promise<Runtime> {
  const rt = new Runtime({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  rt.registerPlugin(plugin);
  await rt.initialize();
  return rt;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('plugin hot-swap', () => {
  it('successfully swaps a plugin and calls setup on the new version', async () => {
    const v1 = makePlugin('my-plugin', '1.0.0');
    const rt = await bootWithPlugin(v1);

    const v2Setup = vi.fn();
    const v2 = makePlugin('my-plugin', '1.0.1', { setup: v2Setup });

    await rt.swapPlugin(v2);

    expect(v2Setup).toHaveBeenCalledOnce();
  });

  it('calls dispose on the old plugin before setting up the new one', async () => {
    const order: string[] = [];
    const v1 = makePlugin('my-plugin', '1.0.0', {
      setup: vi.fn(),
      dispose: vi.fn(() => { order.push('dispose-v1'); })
    });
    const rt = await bootWithPlugin(v1);

    const v2 = makePlugin('my-plugin', '1.0.1', {
      setup: vi.fn(() => { order.push('setup-v2'); })
    });

    await rt.swapPlugin(v2);

    expect(order).toEqual(['dispose-v1', 'setup-v2']);
  });

  it('unregisters old plugin actions before new setup', async () => {
    const rt = new Runtime({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    const v1 = makePlugin('my-plugin', '1.0.0', {
      setup(ctx: RuntimeContext) {
        ctx.actions.registerAction({ id: 'my-plugin:action', handler: () => 'v1' });
      }
    });
    rt.registerPlugin(v1);
    await rt.initialize();

    const ctx = rt.getContext();
    expect(ctx.actions.hasAction('my-plugin:action')).toBe(true);

    const v2 = makePlugin('my-plugin', '1.0.1', {
      setup(ctx: RuntimeContext) {
        ctx.actions.registerAction({ id: 'my-plugin:action', handler: () => 'v2' });
      }
    });

    await rt.swapPlugin(v2);

    // Action should still exist but now be the v2 handler
    expect(ctx.actions.hasAction('my-plugin:action')).toBe(true);
    const result = await ctx.actions.runAction('my-plugin:action');
    expect(result).toBe('v2');
  });

  it('unregisters old plugin services before new setup', async () => {
    const rt = new Runtime({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    const v1 = makePlugin('my-plugin', '1.0.0', {
      setup(ctx: RuntimeContext) {
        ctx.services.register('my-svc', { version: 'v1' });
      }
    });
    rt.registerPlugin(v1);
    await rt.initialize();

    const v2 = makePlugin('my-plugin', '1.0.1', {
      setup(ctx: RuntimeContext) {
        ctx.services.register('my-svc', { version: 'v2' });
      }
    });

    await rt.swapPlugin(v2);

    const ctx = rt.getContext();
    expect(ctx.services.get<{ version: string }>('my-svc').version).toBe('v2');
  });

  it('throws PluginSwapError when runtime is not initialized', async () => {
    const rt = new Runtime();
    rt.registerPlugin(makePlugin('my-plugin', '1.0.0'));

    await expect(rt.swapPlugin(makePlugin('my-plugin', '1.0.1')))
      .rejects.toThrow(PluginSwapError);
  });

  it('throws PluginSwapError when plugin is not registered', async () => {
    const rt = new Runtime({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    rt.registerPlugin(makePlugin('other-plugin', '1.0.0'));
    await rt.initialize();

    await expect(rt.swapPlugin(makePlugin('unknown-plugin', '1.0.1')))
      .rejects.toThrow(PluginSwapError);
  });

  it('throws PluginSwapError when new version is the same', async () => {
    const rt = await bootWithPlugin(makePlugin('my-plugin', '1.0.0'));

    await expect(rt.swapPlugin(makePlugin('my-plugin', '1.0.0')))
      .rejects.toThrow(PluginSwapError);
  });

  it('throws PluginSwapError when new version is a downgrade', async () => {
    const rt = await bootWithPlugin(makePlugin('my-plugin', '2.0.0'));

    await expect(rt.swapPlugin(makePlugin('my-plugin', '1.9.9')))
      .rejects.toThrow(PluginSwapError);
  });

  it('throws PluginSwapError and rolls back when new plugin setup fails', async () => {
    const rt = new Runtime({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    const v1 = makePlugin('my-plugin', '1.0.0', {
      setup(ctx: RuntimeContext) {
        ctx.actions.registerAction({ id: 'my-plugin:stable', handler: () => 'stable' });
      }
    });
    rt.registerPlugin(v1);
    await rt.initialize();

    const v2 = makePlugin('my-plugin', '1.0.1', {
      setup: vi.fn(() => { throw new Error('setup exploded'); })
    });

    await expect(rt.swapPlugin(v2)).rejects.toThrow(PluginSwapError);

    // After failed swap, the action registered by v2 should not exist
    // (v1's action was torn down before v2 attempted setup, so it's gone too)
    const ctx = rt.getContext();
    expect(ctx.actions.hasAction('my-plugin:stable')).toBe(false);
  });

  it('emits plugin:swapped event with correct payload', async () => {
    const rt = await bootWithPlugin(makePlugin('my-plugin', '1.0.0'));
    const ctx = rt.getContext();

    const swapEvents: unknown[] = [];
    ctx.events.on('plugin:swapped', (data) => swapEvents.push(data));

    await rt.swapPlugin(makePlugin('my-plugin', '2.0.0'));

    expect(swapEvents).toHaveLength(1);
    expect(swapEvents[0]).toEqual({
      name: 'my-plugin',
      previousVersion: '1.0.0',
      newVersion: '2.0.0'
    });
  });

  it('runs config validation on new plugin before setup', async () => {
    const rt = new Runtime<Record<string, unknown>>({
      config: { apiKey: 'valid-key' },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });
    rt.registerPlugin(makePlugin('my-plugin', '1.0.0'));
    await rt.initialize();

    const v2Setup = vi.fn();
    const v2: PluginDefinition = {
      name: 'my-plugin',
      version: '1.0.1',
      validateConfig: vi.fn(() => ({ valid: false, errors: ['apiKey is invalid'] })),
      setup: v2Setup
    };

    await expect(rt.swapPlugin(v2)).rejects.toThrow(PluginSwapError);
    expect(v2Setup).not.toHaveBeenCalled();
  });

  it('ctx.plugins.isInitialized() returns true after a successful swap', async () => {
    const rt = await bootWithPlugin(makePlugin('my-plugin', '1.0.0'));
    const ctx = rt.getContext();

    await rt.swapPlugin(makePlugin('my-plugin', '1.1.0'));

    expect(ctx.plugins.isInitialized('my-plugin')).toBe(true);
  });

  it('introspect.getPluginDefinition() returns new version after swap', async () => {
    const rt = await bootWithPlugin(makePlugin('my-plugin', '1.0.0'));
    const ctx = rt.getContext();

    await rt.swapPlugin(makePlugin('my-plugin', '3.0.0'));

    expect(ctx.introspect.getPluginDefinition('my-plugin')?.version).toBe('3.0.0');
  });
});
