import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import {
  createFeatureFlagPlugin,
  MemoryFlagStore,
  FEATURE_FLAG_SERVICE,
  FEATURE_FLAG_AUDIT_SERVICE,
  ReadonlyFlagError,
  FlagTypeMismatchError,
  type FeatureFlagService,
  type FlagAuditService,
  type FlagStore,
  type FlagValue,
  type EvaluationContext,
} from '../../src/plugins/FeatureFlagPlugin.js';

// ─── Shared factory ───────────────────────────────────────────────────────────

function makeRuntime(store?: FlagStore) {
  const runtime = new Runtime();
  runtime.registerPlugin(
    createFeatureFlagPlugin({
      flags: [
        { key: 'new-ui',      defaultValue: false,  type: 'boolean', description: 'Enable new UI' },
        { key: 'max-retries', defaultValue: 3,       type: 'number' },
        { key: 'theme',       defaultValue: 'light', type: 'string' },
        { key: 'locked',      defaultValue: true,    type: 'boolean', readonly: true },
      ],
      overrides: { 'new-ui': true },
      store,
    })
  );
  return runtime;
}

describe('FeatureFlagPlugin', () => {
  let runtime: Runtime;
  let flags: FeatureFlagService;
  let audit: FlagAuditService;

  beforeEach(async () => {
    runtime = makeRuntime();
    await runtime.initialize();
    flags = runtime.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
    audit = runtime.getContext().services.get<FlagAuditService>(FEATURE_FLAG_AUDIT_SERVICE);
  });

  afterEach(async () => {
    await runtime.shutdown();
  });

  // ── Service lifecycle ───────────────────────────────────────────────────

  it('registers both services on init', () => {
    const ctx = runtime.getContext();
    expect(ctx.services.has(FEATURE_FLAG_SERVICE)).toBe(true);
    expect(ctx.services.has(FEATURE_FLAG_AUDIT_SERVICE)).toBe(true);
  });

  it('unregisters both services on dispose so re-init does not throw', async () => {
    await runtime.shutdown();
    const r2 = makeRuntime();
    await expect(r2.initialize()).resolves.not.toThrow();
    await r2.shutdown();
  });

  // ── validateConfig ──────────────────────────────────────────────────────

  it('rejects empty flag key', async () => {
    const bad = new Runtime();
    bad.registerPlugin(createFeatureFlagPlugin({
      flags: [{ key: '', defaultValue: true, type: 'boolean' }],
    }));
    await expect(bad.initialize()).rejects.toThrow();
  });

  it('rejects duplicate flag key', async () => {
    const bad = new Runtime();
    bad.registerPlugin(createFeatureFlagPlugin({
      flags: [
        { key: 'dupe', defaultValue: true,  type: 'boolean' },
        { key: 'dupe', defaultValue: false, type: 'boolean' },
      ],
    }));
    await expect(bad.initialize()).rejects.toThrow();
  });

  it('rejects defaultValue type mismatch', async () => {
    const bad = new Runtime();
    bad.registerPlugin(createFeatureFlagPlugin({
      flags: [{ key: 'bad', defaultValue: 'oops', type: 'boolean' }],
    }));
    await expect(bad.initialize()).rejects.toThrow();
  });

  // ── Flag evaluation ─────────────────────────────────────────────────────

  it('applies overrides over defaults', () => {
    expect(flags.isEnabled('new-ui')).toBe(true);
  });

  it('getValue returns typed number', () => {
    expect(flags.getValue<number>('max-retries')).toBe(3);
  });

  it('getValue returns typed string', () => {
    expect(flags.getValue<string>('theme')).toBe('light');
  });

  it('isEnabled returns false and warns for unknown flag', () => {
    expect(flags.isEnabled('ghost')).toBe(false);
  });

  it('getValue throws for unknown flag', () => {
    expect(() => flags.getValue('ghost')).toThrow('not registered');
  });

  it('getFlagDefinition returns frozen definition', () => {
    const def = flags.getFlagDefinition('theme');
    expect(def).toBeDefined();
    expect(def!.type).toBe('string');
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('getFlagDefinition returns undefined for unknown key', () => {
    expect(flags.getFlagDefinition('ghost')).toBeUndefined();
  });

  // ── setFlag ─────────────────────────────────────────────────────────────

  it('setFlag mutates the store', () => {
    flags.setFlag('theme', 'dark');
    expect(flags.getValue<string>('theme')).toBe('dark');
  });

  it('setFlag emits flag:changed with timestamp', () => {
    const ctx = runtime.getContext();
    const events: unknown[] = [];
    ctx.events.on('flag:changed', (d) => events.push(d));

    flags.setFlag('theme', 'dark');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'theme', value: 'dark', previous: 'light' });
    expect((events[0] as any).timestamp).toBeTypeOf('number');
  });

  it('setFlag coerces string "5" to number for a number flag', () => {
    flags.setFlag('max-retries', '5' as any);
    expect(flags.getValue<number>('max-retries')).toBe(5);
  });

  it('setFlag coerces 1 to true for a boolean flag', () => {
    flags.setFlag('new-ui', 1 as any);
    expect(flags.getValue<boolean>('new-ui')).toBe(true);
  });

  it('setFlag throws ReadonlyFlagError for locked flag', () => {
    expect(() => flags.setFlag('locked', false)).toThrow(ReadonlyFlagError);
  });

  it('setFlag throws FlagTypeMismatchError when coercion is impossible', () => {
    expect(() => flags.setFlag('max-retries', 'not-a-number' as any)).toThrow(FlagTypeMismatchError);
  });

  // ── unsetFlag ───────────────────────────────────────────────────────────

  it('unsetFlag removes the flag', () => {
    flags.unsetFlag('theme');
    expect(flags.isEnabled('theme')).toBe(false);
  });

  it('unsetFlag emits flag:removed with timestamp', () => {
    const ctx = runtime.getContext();
    const events: unknown[] = [];
    ctx.events.on('flag:removed', (d) => events.push(d));

    flags.unsetFlag('theme');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'theme', previous: 'light' });
    expect((events[0] as any).timestamp).toBeTypeOf('number');
  });

  it('unsetFlag is a no-op for unknown keys', () => {
    expect(() => flags.unsetFlag('ghost')).not.toThrow();
  });

  it('unsetFlag throws ReadonlyFlagError for locked flag', () => {
    expect(() => flags.unsetFlag('locked')).toThrow(ReadonlyFlagError);
  });

  // ── getAllFlags ─────────────────────────────────────────────────────────

  it('getAllFlags returns all current values', () => {
    expect(flags.getAllFlags()).toMatchObject({
      'new-ui': true, 'max-retries': 3, theme: 'light', locked: true,
    });
  });

  // ── Audit log ───────────────────────────────────────────────────────────

  describe('audit log', () => {
    it('records init entries for each declared flag', () => {
      const history = audit.getHistory();
      const initEntries = history.filter((e) => e.source === 'init');
      expect(initEntries.length).toBe(4); // 4 declared flags
    });

    it('records override entries', () => {
      const history = audit.getHistory();
      const overrideEntries = history.filter((e) => e.source === 'override');
      expect(overrideEntries.length).toBe(1);
      expect(overrideEntries[0].key).toBe('new-ui');
      expect(overrideEntries[0].newValue).toBe(true);
    });

    it('records runtime change with correct previous/new values', () => {
      flags.setFlag('theme', 'dark');
      const history = audit.getHistory('theme');
      const runtimeEntry = history.find((e) => e.source === 'runtime');
      expect(runtimeEntry).toBeDefined();
      expect(runtimeEntry!.previousValue).toBe('light');
      expect(runtimeEntry!.newValue).toBe('dark');
    });

    it('records unset as newValue: undefined', () => {
      flags.unsetFlag('theme');
      const history = audit.getHistory('theme');
      const removal = history.find((e) => e.newValue === undefined && e.source === 'runtime');
      expect(removal).toBeDefined();
      expect(removal!.previousValue).toBe('light');
    });

    it('getHistory filtered by key returns only that key', () => {
      flags.setFlag('theme', 'dark');
      flags.setFlag('max-retries', 5);
      const history = audit.getHistory('theme');
      expect(history.every((e) => e.key === 'theme')).toBe(true);
    });

    it('audit entries are frozen', () => {
      const entry = audit.getHistory()[0];
      expect(Object.isFrozen(entry)).toBe(true);
      expect(() => { (entry as any).key = 'hacked'; }).toThrow();
    });

    it('clearHistory empties the log', () => {
      audit.clearHistory();
      expect(audit.getHistory()).toHaveLength(0);
    });

    it('respects maxAuditEntries cap', async () => {
      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'x', defaultValue: 0, type: 'number' }],
        maxAuditEntries: 5,
      }));
      await r.initialize();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      const a = r.getContext().services.get<FlagAuditService>(FEATURE_FLAG_AUDIT_SERVICE);
      for (let i = 1; i <= 10; i++) f.setFlag('x', i);
      expect(a.getHistory().length).toBeLessThanOrEqual(5);
      await r.shutdown();
    });
  });

  // ── Persistence (FlagStore) ──────────────────────────────────────────────

  describe('FlagStore persistence', () => {
    it('loads persisted values at startup (higher precedence than overrides)', async () => {
      const store = new MemoryFlagStore();
      await store.save('theme', 'solarized');

      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'theme', defaultValue: 'light', type: 'string' }],
        overrides: { theme: 'dark' },
        store,
      }));
      await r.initialize();

      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<string>('theme')).toBe('solarized');
      await r.shutdown();
    });

    it('persists flag changes via setFlag', async () => {
      const store = new MemoryFlagStore();
      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'theme', defaultValue: 'light', type: 'string' }],
        store,
      }));
      await r.initialize();

      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      f.setFlag('theme', 'dark');

      // Allow the async save to complete
      await new Promise((res) => setTimeout(res, 10));
      expect(await store.load('theme')).toBe('dark');
      await r.shutdown();
    });

    it('deletes persisted value via unsetFlag', async () => {
      const store = new MemoryFlagStore();
      await store.save('theme', 'dark');

      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'theme', defaultValue: 'light', type: 'string' }],
        store,
      }));
      await r.initialize();

      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      f.unsetFlag('theme');

      await new Promise((res) => setTimeout(res, 10));
      expect(await store.load('theme')).toBeUndefined();
      await r.shutdown();
    });

    it('skips persisted value for readonly flags', async () => {
      const store = new MemoryFlagStore();
      await store.save('locked', false); // attempt to override a readonly flag

      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'locked', defaultValue: true, type: 'boolean', readonly: true }],
        store,
      }));
      await r.initialize();

      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<boolean>('locked')).toBe(true); // default preserved
      await r.shutdown();
    });

    it('records store-loaded values in audit log with source "store"', async () => {
      const store = new MemoryFlagStore();
      await store.save('theme', 'solarized');

      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'theme', defaultValue: 'light', type: 'string' }],
        store,
      }));
      await r.initialize();

      const a = r.getContext().services.get<FlagAuditService>(FEATURE_FLAG_AUDIT_SERVICE);
      const storeEntries = a.getHistory('theme').filter((e) => e.source === 'store');
      expect(storeEntries).toHaveLength(1);
      expect(storeEntries[0].newValue).toBe('solarized');
      await r.shutdown();
    });

    it('continues gracefully when store.loadAll() rejects', async () => {
      const brokenStore: FlagStore = {
        loadAll: async () => { throw new Error('DB down'); },
        load: async () => undefined,
        save: async () => {},
        delete: async () => {},
      };

      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{ key: 'theme', defaultValue: 'light', type: 'string' }],
        store: brokenStore,
      }));
      // Should not throw — error is logged and defaults are used
      await expect(r.initialize()).resolves.not.toThrow();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<string>('theme')).toBe('light');
      await r.shutdown();
    });
  });

  // ── Actions ─────────────────────────────────────────────────────────────

  describe('actions', () => {
    it('flags:isEnabled', async () => {
      const result = await runtime.getContext().actions.runAction<{ key: string }, boolean>('flags:isEnabled', { key: 'new-ui' });
      expect(result).toBe(true);
    });

    it('flags:getValue', async () => {
      const result = await runtime.getContext().actions.runAction<{ key: string }, number>('flags:getValue', { key: 'max-retries' });
      expect(result).toBe(3);
    });

    it('flags:set', async () => {
      await runtime.getContext().actions.runAction('flags:set', { key: 'theme', value: 'dark' });
      expect(flags.getValue<string>('theme')).toBe('dark');
    });

    it('flags:unset', async () => {
      await runtime.getContext().actions.runAction('flags:unset', { key: 'theme' });
      expect(flags.isEnabled('theme')).toBe(false);
    });

    it('flags:getAll', async () => {
      const all = await runtime.getContext().actions.runAction<void, Record<string, FlagValue>>('flags:getAll');
      expect(all).toHaveProperty('theme', 'light');
    });

    it('flags:getHistory returns all entries', async () => {
      const history = await runtime.getContext().actions.runAction<{ key?: string }, readonly unknown[]>('flags:getHistory', {});
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('flags:getHistory filtered by key', async () => {
      flags.setFlag('theme', 'dark');
      const history = await runtime.getContext().actions.runAction<{ key?: string }, readonly any[]>('flags:getHistory', { key: 'theme' });
      expect(history.every((e: any) => e.key === 'theme')).toBe(true);
    });

    it('flags:clearHistory empties the log', async () => {
      await runtime.getContext().actions.runAction('flags:clearHistory');
      expect(audit.getHistory()).toHaveLength(0);
    });
  });

  // ── Core API integration ─────────────────────────────────────────────────

  describe('core API integration', () => {
    it('hasAction returns true for all registered actions', () => {
      const ctx = runtime.getContext();
      ['flags:isEnabled', 'flags:getValue', 'flags:set', 'flags:unset',
       'flags:getAll', 'flags:getHistory', 'flags:clearHistory', 'flags:evaluate'].forEach((id) => {
        expect(ctx.actions.hasAction(id)).toBe(true);
      });
    });

    it('plugins.isInitialized returns true after init', () => {
      expect(runtime.getContext().plugins.isInitialized('feature-flags')).toBe(true);
    });

    it('introspect surfaces plugin description', () => {
      const meta = runtime.getContext().introspect.getPluginDefinition('feature-flags');
      expect(meta!.description).toContain('audit log');
    });

    it('introspect surfaces action description', () => {
      const meta = runtime.getContext().introspect.getActionDefinition('flags:set');
      expect(meta!.description).toContain('readonly-guarded');
    });

    it('introspected metadata is frozen', () => {
      const meta = runtime.getContext().introspect.getActionDefinition('flags:isEnabled')!;
      expect(Object.isFrozen(meta)).toBe(true);
      expect(() => { (meta as any).id = 'hacked'; }).toThrow();
    });
  });

  // ── Phase 3: Targeting / Evaluation context ──────────────────────────────

  describe('targeting rules', () => {
    async function makeTargetedRuntime() {
      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [
          {
            key: 'dark-mode',
            defaultValue: false,
            type: 'boolean',
            rules: [
              { type: 'exact-match', attribute: 'environment', value: 'staging', result: true },
              { type: 'exact-match', attribute: 'userId', value: 'user-beta', result: true },
              { type: 'attribute-contains', attribute: 'plan', value: 'pro', result: true },
            ],
          },
          {
            key: 'rollout',
            defaultValue: false,
            type: 'boolean',
            rules: [
              { type: 'percentage-rollout', percentage: 100, result: true },
            ],
          },
          {
            key: 'no-rules',
            defaultValue: 'base',
            type: 'string',
          },
        ],
      }));
      await r.initialize();
      return r;
    }

    it('returns default when no context provided', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode')).toBe(false);
      await r.shutdown();
    });

    it('exact-match on environment returns rule result', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode', { environment: 'staging' })).toBe(true);
      await r.shutdown();
    });

    it('exact-match on userId returns rule result', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode', { userId: 'user-beta' })).toBe(true);
      await r.shutdown();
    });

    it('exact-match does not fire for non-matching value', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode', { environment: 'production' })).toBe(false);
      await r.shutdown();
    });

    it('attribute-contains matches substring', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode', { attributes: { plan: 'pro-annual' } })).toBe(true);
      await r.shutdown();
    });

    it('attribute-contains does not match when substring absent', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('dark-mode', { attributes: { plan: 'free' } })).toBe(false);
      await r.shutdown();
    });

    it('percentage-rollout at 100% always returns rule result', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('rollout', { userId: 'any-user' })).toBe(true);
      await r.shutdown();
    });

    it('percentage-rollout at 0% never returns rule result', async () => {
      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{
          key: 'zero',
          defaultValue: false,
          type: 'boolean',
          rules: [{ type: 'percentage-rollout', percentage: 0, result: true }],
        }],
      }));
      await r.initialize();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.isEnabled('zero', { userId: 'any-user' })).toBe(false);
      await r.shutdown();
    });

    it('percentage-rollout skips when no userId', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      // No userId → rollout rule skipped → falls back to default (false)
      expect(f.isEnabled('rollout', {})).toBe(false);
      await r.shutdown();
    });

    it('getValue with context returns rule result', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<boolean>('dark-mode', { environment: 'staging' })).toBe(true);
      await r.shutdown();
    });

    it('getValue without context returns store value for flag with rules', async () => {
      const r = await makeTargetedRuntime();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<string>('no-rules')).toBe('base');
      await r.shutdown();
    });

    it('first matching rule wins (rules are ordered)', async () => {
      const r = new Runtime();
      r.registerPlugin(createFeatureFlagPlugin({
        flags: [{
          key: 'ordered',
          defaultValue: 'none',
          type: 'string',
          rules: [
            { type: 'exact-match', attribute: 'environment', value: 'staging', result: 'first' },
            { type: 'exact-match', attribute: 'environment', value: 'staging', result: 'second' },
          ],
        }],
      }));
      await r.initialize();
      const f = r.getContext().services.get<FeatureFlagService>(FEATURE_FLAG_SERVICE);
      expect(f.getValue<string>('ordered', { environment: 'staging' })).toBe('first');
      await r.shutdown();
    });

    it('flags:evaluate action resolves with context', async () => {
      const r = await makeTargetedRuntime();
      const result = await r.getContext().actions.runAction<{ key: string; ctx?: EvaluationContext }, FlagValue>(
        'flags:evaluate',
        { key: 'dark-mode', ctx: { environment: 'staging' } }
      );
      expect(result).toBe(true);
      await r.shutdown();
    });

    it('flags:evaluate action falls back to default without context', async () => {
      const r = await makeTargetedRuntime();
      const result = await r.getContext().actions.runAction<{ key: string; ctx?: EvaluationContext }, FlagValue>(
        'flags:evaluate',
        { key: 'dark-mode' }
      );
      expect(result).toBe(false);
      await r.shutdown();
    });
  });
});
