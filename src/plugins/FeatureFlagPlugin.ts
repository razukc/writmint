import { type PluginDefinition, type RuntimeContext, type ConfigValidationResult } from '../types.js';

// ─── Core value types ─────────────────────────────────────────────────────────

export type FlagValue = boolean | string | number;
export type FlagType = 'boolean' | 'string' | 'number';

// ─── Targeting / Evaluation context (Phase 3) ─────────────────────────────────

export interface EvaluationContext {
  userId?: string;
  environment?: string;
  attributes?: Record<string, string | number | boolean>;
}

export type FlagRuleType = 'exact-match' | 'percentage-rollout' | 'attribute-contains';

export interface FlagRule {
  type: FlagRuleType;
  /** For exact-match: attribute key to match against. */
  attribute?: string;
  /** For exact-match / attribute-contains: the value to compare. */
  value?: string | number | boolean;
  /** For percentage-rollout: 0–100 inclusive. */
  percentage?: number;
  /** The flag value to return when this rule matches. */
  result: FlagValue;
}

// ─── Flag definition ──────────────────────────────────────────────────────────

export interface FlagDefinition {
  key: string;
  defaultValue: FlagValue;
  type: FlagType;
  description?: string;
  /** When true, setFlag() and unsetFlag() throw ReadonlyFlagError. */
  readonly?: boolean;
  /**
   * Ordered list of targeting rules. The first matching rule wins.
   * Falls back to the current store value when no rule matches.
   */
  rules?: FlagRule[];
}

// ─── Persistence adapter (Phase 2) ───────────────────────────────────────────

/**
 * Pluggable persistence backend for feature flags.
 * Implement this interface to back flags with localStorage, Redis, a DB, etc.
 */
export interface FlagStore {
  /** Load a single persisted value. Returns undefined if not persisted. */
  load(key: string): Promise<FlagValue | undefined>;
  /** Load all persisted overrides at startup. */
  loadAll(): Promise<Record<string, FlagValue>>;
  /** Persist a flag change. */
  save(key: string, value: FlagValue): Promise<void>;
  /** Remove a persisted flag. */
  delete(key: string): Promise<void>;
}

/** Default in-memory store — same behaviour as Phase 1 (no persistence). */
export class MemoryFlagStore implements FlagStore {
  private data = new Map<string, FlagValue>();

  async load(key: string): Promise<FlagValue | undefined> {
    return this.data.get(key);
  }
  async loadAll(): Promise<Record<string, FlagValue>> {
    return Object.fromEntries(this.data.entries());
  }
  async save(key: string, value: FlagValue): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

// ─── Audit log (Phase 2) ──────────────────────────────────────────────────────

export type FlagChangeSource = 'init' | 'override' | 'runtime' | 'store';

export interface FlagAuditEntry {
  readonly key: string;
  readonly previousValue: FlagValue | undefined;
  readonly newValue: FlagValue | undefined;
  readonly timestamp: number;
  readonly source: FlagChangeSource;
}

export interface FlagAuditService {
  getHistory(key?: string): readonly FlagAuditEntry[];
  clearHistory(): void;
}

export const FEATURE_FLAG_AUDIT_SERVICE = 'feature-flags:audit';

// ─── Public service interface ─────────────────────────────────────────────────

export interface FeatureFlagService {
  isEnabled(key: string, ctx?: EvaluationContext): boolean;
  getValue<T extends FlagValue>(key: string, ctx?: EvaluationContext): T;
  setFlag(key: string, value: FlagValue): void;
  unsetFlag(key: string): void;
  getAllFlags(): Record<string, FlagValue>;
  getFlagDefinition(key: string): Readonly<FlagDefinition> | undefined;
}

// ─── Plugin config ────────────────────────────────────────────────────────────

export interface FeatureFlagPluginConfig {
  flags?: FlagDefinition[];
  /** Static overrides applied after defaults (e.g. from env vars). */
  overrides?: Record<string, FlagValue>;
  /**
   * Persistence backend. Defaults to MemoryFlagStore (no persistence).
   * Persisted values are loaded during setup and take precedence over
   * static overrides.
   */
  store?: FlagStore;
  /** Maximum audit entries to keep in memory. Defaults to 500. */
  maxAuditEntries?: number;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ReadonlyFlagError extends Error {
  constructor(public readonly key: string) {
    super(`Feature flag "${key}" is readonly and cannot be modified`);
    this.name = 'ReadonlyFlagError';
  }
}

export class FlagTypeMismatchError extends Error {
  constructor(
    public readonly key: string,
    public readonly expected: FlagType,
    public readonly received: string
  ) {
    super(`Feature flag "${key}" expects type "${expected}", got "${received}"`);
    this.name = 'FlagTypeMismatchError';
  }
}

// ─── Service name ─────────────────────────────────────────────────────────────

export const FEATURE_FLAG_SERVICE = 'feature-flags';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function coerce(key: string, value: FlagValue, type: FlagType): FlagValue {
  const actual = typeof value;
  if (actual === type) return value;
  if (type === 'boolean') return Boolean(value);
  if (type === 'number') {
    const n = Number(value);
    if (isNaN(n)) throw new FlagTypeMismatchError(key, type, actual);
    return n;
  }
  if (type === 'string') return String(value);
  throw new FlagTypeMismatchError(key, type, actual);
}

function validateFlagDefinitions(flags: FlagDefinition[]): ConfigValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const flag of flags) {
    if (!flag.key || typeof flag.key !== 'string') {
      errors.push('Flag has empty or invalid key');
      continue;
    }
    if (seen.has(flag.key)) {
      errors.push(`Duplicate flag key "${flag.key}"`);
      continue;
    }
    seen.add(flag.key);

    if (!['boolean', 'string', 'number'].includes(flag.type)) {
      errors.push(`Flag "${flag.key}" has invalid type "${flag.type as string}"`);
    }
    if (typeof flag.defaultValue !== flag.type) {
      errors.push(
        `Flag "${flag.key}" defaultValue type mismatch: expected ${flag.type}, got ${typeof flag.defaultValue}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Rule evaluation engine (Phase 3) ────────────────────────────────────────

/**
 * Deterministic hash of a string → integer in [0, 100).
 * Used for stable percentage-rollout bucketing per userId.
 */
function hashBucket(userId: string, key: string): number {
  const str = `${userId}:${key}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

function evaluateRules(
  rules: FlagRule[],
  evalCtx: EvaluationContext,
  key: string
): FlagValue | undefined {
  for (const rule of rules) {
    switch (rule.type) {
      case 'exact-match': {
        const attrKey = rule.attribute ?? 'environment';
        const attrVal =
          attrKey === 'userId'
            ? evalCtx.userId
            : attrKey === 'environment'
            ? evalCtx.environment
            : evalCtx.attributes?.[attrKey];
        if (attrVal !== undefined && attrVal === rule.value) return rule.result;
        break;
      }
      case 'percentage-rollout': {
        if (!evalCtx.userId) break;
        const bucket = hashBucket(evalCtx.userId, key);
        if (bucket < (rule.percentage ?? 0)) return rule.result;
        break;
      }
      case 'attribute-contains': {
        const attrKey = rule.attribute ?? 'environment';
        const attrVal =
          attrKey === 'userId'
            ? evalCtx.userId
            : attrKey === 'environment'
            ? evalCtx.environment
            : evalCtx.attributes?.[attrKey];
        if (typeof attrVal === 'string' && typeof rule.value === 'string' && attrVal.includes(rule.value)) {
          return rule.result;
        }
        break;
      }
    }
  }
  return undefined;
}

// ─── Plugin factory ───────────────────────────────────────────────────────────

export function createFeatureFlagPlugin(config: FeatureFlagPluginConfig = {}): PluginDefinition {
  const flagStore: FlagStore = config.store ?? new MemoryFlagStore();
  const maxAudit = config.maxAuditEntries ?? 500;

  return {
    name: 'feature-flags',
    version: '3.0.0',
    description: 'Runtime feature flag management with type safety, readonly locks, persistence, audit log, and targeting rules',

    validateConfig(): ConfigValidationResult {
      return validateFlagDefinitions(config.flags ?? []);
    },

    async setup(context: RuntimeContext): Promise<void> {
      const store = new Map<string, FlagValue>();
      const definitions = new Map<string, Readonly<FlagDefinition>>();
      const auditLog: FlagAuditEntry[] = [];

      // ── Audit helper ────────────────────────────────────────────────────

      function record(
        key: string,
        previousValue: FlagValue | undefined,
        newValue: FlagValue | undefined,
        source: FlagChangeSource
      ): void {
        const entry: FlagAuditEntry = Object.freeze({ key, previousValue, newValue, timestamp: Date.now(), source });
        auditLog.push(entry);
        if (auditLog.length > maxAudit) auditLog.shift();
      }

      // ── 1. Seed defaults ────────────────────────────────────────────────

      for (const flag of config.flags ?? []) {
        definitions.set(flag.key, Object.freeze({ ...flag }));
        store.set(flag.key, flag.defaultValue);
        record(flag.key, undefined, flag.defaultValue, 'init');
      }

      // ── 2. Apply static overrides ───────────────────────────────────────

      for (const [key, rawValue] of Object.entries(config.overrides ?? {})) {
        const def = definitions.get(key);
        const coerced = def ? coerce(key, rawValue, def.type) : rawValue;
        const previous = store.get(key);
        store.set(key, coerced);
        record(key, previous, coerced, 'override');
      }

      // ── 3. Load persisted values (highest precedence) ───────────────────

      try {
        const persisted = await flagStore.loadAll();
        for (const [key, rawValue] of Object.entries(persisted)) {
          const def = definitions.get(key);
          // Skip readonly flags — persisted values cannot override a lock
          if (def?.readonly) {
            context.logger.warn(`[feature-flags] Skipping persisted value for readonly flag "${key}"`);
            continue;
          }
          const coerced = def ? coerce(key, rawValue, def.type) : rawValue;
          const previous = store.get(key);
          store.set(key, coerced);
          record(key, previous, coerced, 'store');
        }
      } catch (err) {
        context.logger.error('[feature-flags] Failed to load persisted flags', err);
      }

      // ── Service ──────────────────────────────────────────────────────────

      const service: FeatureFlagService = {
        isEnabled(key: string, evalCtx?: EvaluationContext): boolean {
          const def = definitions.get(key);
          if (evalCtx && def?.rules?.length) {
            const result = evaluateRules(def.rules, evalCtx, key);
            if (result !== undefined) return Boolean(result);
          }
          const val = store.get(key);
          if (val === undefined) {
            context.logger.warn(`[feature-flags] Unknown flag "${key}", returning false`);
            return false;
          }
          return Boolean(val);
        },

        getValue<T extends FlagValue>(key: string, evalCtx?: EvaluationContext): T {
          const def = definitions.get(key);
          if (evalCtx && def?.rules?.length) {
            const result = evaluateRules(def.rules, evalCtx, key);
            if (result !== undefined) return result as T;
          }
          const val = store.get(key);
          if (val === undefined) {
            throw new Error(`[feature-flags] Flag "${key}" is not registered`);
          }
          return val as T;
        },

        setFlag(key: string, value: FlagValue): void {
          const def = definitions.get(key);
          if (def?.readonly) throw new ReadonlyFlagError(key);

          const coerced = def ? coerce(key, value, def.type) : value;
          const previous = store.get(key);
          store.set(key, coerced);
          record(key, previous, coerced, 'runtime');

          // Persist asynchronously — fire and forget, errors logged
          flagStore.save(key, coerced).catch((err) => {
            context.logger.error(`[feature-flags] Failed to persist flag "${key}"`, err);
          });

          context.events.emit('flag:changed', { key, value: coerced, previous, timestamp: auditLog.at(-1)!.timestamp });
          context.logger.debug(`[feature-flags] "${key}": ${String(previous)} → ${String(coerced)}`);
        },

        unsetFlag(key: string): void {
          if (!store.has(key)) return;
          const def = definitions.get(key);
          if (def?.readonly) throw new ReadonlyFlagError(key);

          const previous = store.get(key);
          store.delete(key);
          record(key, previous, undefined, 'runtime');

          flagStore.delete(key).catch((err) => {
            context.logger.error(`[feature-flags] Failed to delete persisted flag "${key}"`, err);
          });

          context.events.emit('flag:removed', { key, previous, timestamp: auditLog.at(-1)!.timestamp });
          context.logger.debug(`[feature-flags] Flag "${key}" removed`);
        },

        getAllFlags(): Record<string, FlagValue> {
          return Object.fromEntries(store.entries());
        },

        getFlagDefinition(key: string): Readonly<FlagDefinition> | undefined {
          return definitions.get(key);
        }
      };

      // ── Audit service ─────────────────────────────────────────────────────

      const auditService: FlagAuditService = {
        getHistory(key?: string): readonly FlagAuditEntry[] {
          return key ? auditLog.filter((e) => e.key === key) : [...auditLog];
        },
        clearHistory(): void {
          auditLog.length = 0;
        }
      };

      context.services.register(FEATURE_FLAG_SERVICE, service);
      context.services.register(FEATURE_FLAG_AUDIT_SERVICE, auditService);

      // ── Actions ──────────────────────────────────────────────────────────

      context.actions.registerAction<{ key: string }, boolean>({
        id: 'flags:isEnabled',
        description: 'Returns true if the named flag is enabled',
        handler: ({ key }) => service.isEnabled(key)
      });

      context.actions.registerAction<{ key: string }, FlagValue>({
        id: 'flags:getValue',
        description: 'Returns the current value of a flag',
        handler: ({ key }) => service.getValue(key)
      });

      context.actions.registerAction<{ key: string; value: FlagValue }, void>({
        id: 'flags:set',
        description: 'Sets a flag value (type-coerced, readonly-guarded) and emits flag:changed',
        handler: ({ key, value }) => service.setFlag(key, value)
      });

      context.actions.registerAction<{ key: string }, void>({
        id: 'flags:unset',
        description: 'Removes a flag from the store and emits flag:removed',
        handler: ({ key }) => service.unsetFlag(key)
      });

      context.actions.registerAction<void, Record<string, FlagValue>>({
        id: 'flags:getAll',
        description: 'Returns all current flag values',
        handler: () => service.getAllFlags()
      });

      context.actions.registerAction<{ key?: string }, readonly FlagAuditEntry[]>({
        id: 'flags:getHistory',
        description: 'Returns the audit log, optionally filtered by flag key',
        handler: ({ key } = {}) => auditService.getHistory(key)
      });

      context.actions.registerAction<void, void>({
        id: 'flags:clearHistory',
        description: 'Clears the in-memory audit log',
        handler: () => auditService.clearHistory()
      });

      context.actions.registerAction<{ key: string; ctx?: EvaluationContext }, FlagValue>({
        id: 'flags:evaluate',
        description: 'Evaluates a flag against an optional targeting context, returning the resolved value',
        handler: ({ key, ctx }) => service.getValue(key, ctx)
      });

      context.logger.info(`[feature-flags] Initialized with ${store.size} flag(s)`);
    },

    dispose(context: RuntimeContext): void {
      context.services.unregister(FEATURE_FLAG_AUDIT_SERVICE);
      context.services.unregister(FEATURE_FLAG_SERVICE);
      context.logger.debug('[feature-flags] Services unregistered');
    }
  };
}
