import { PluginDefinition, RuntimeContext, Logger, ValidationError, DuplicateRegistrationError } from './types.js';

// ─── Semver helpers ───────────────────────────────────────────────────────────

/**
 * Parses a semver string into [major, minor, patch].
 * Accepts "1.2.3" or "v1.2.3". Returns null for invalid strings.
 */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Returns true if `next` is strictly greater than `current` by semver rules.
 */
export function isNewerVersion(current: string, next: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(next);
  if (!a || !b) return false;
  if (b[0] !== a[0]) return b[0] > a[0];
  if (b[1] !== a[1]) return b[1] > a[1];
  return b[2] > a[2];
}

export class PluginRegistry<TConfig = Record<string, unknown>> {
  private plugins: Map<string, PluginDefinition<TConfig>>;
  private initializedPlugins: string[];
  private logger: Logger;
  /** Tracks unregister callbacks registered by each plugin during setup */
  private pluginResources: Map<string, Array<() => void>>;

  constructor(logger: Logger) {
    this.plugins = new Map();
    this.initializedPlugins = [];
    this.logger = logger;
    this.pluginResources = new Map();
  }

  registerPlugin(plugin: PluginDefinition<TConfig>): void {
    // Validate required fields with ValidationError
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new ValidationError('Plugin', 'name');
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new ValidationError('Plugin', 'version', plugin.name);
    }
    if (!plugin.setup || typeof plugin.setup !== 'function') {
      throw new ValidationError('Plugin', 'setup', plugin.name);
    }

    // Check for duplicate plugin name with DuplicateRegistrationError
    if (this.plugins.has(plugin.name)) {
      throw new DuplicateRegistrationError('Plugin', plugin.name);
    }

    this.plugins.set(plugin.name, plugin);
  }

  getPlugin(name: string): PluginDefinition<TConfig> | null {
    return this.plugins.get(name) ?? null;
  }

  getAllPlugins(): PluginDefinition<TConfig>[] {
    // Return array copy to prevent external mutation
    return Array.from(this.plugins.values());
  }

  /**
   * Returns the names of all successfully initialized plugins.
   * Returns an array copy to prevent external mutation.
   * 
   * @returns Array of initialized plugin names in initialization order
   * 
   * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
   */
  getInitializedPlugins(): string[] {
    // Return array copy to prevent external mutation
    return [...this.initializedPlugins];
  }

  /**
   * Returns true if the named plugin has completed setup successfully.
   * Safe to call from within another plugin's setup to check peer state.
   *
   * @param name - Plugin name to check
   */
  isInitialized(name: string): boolean {
    return this.initializedPlugins.includes(name);
  }

  /**
   * Builds a context proxy for a specific plugin that intercepts resource
   * registration calls and records their unregister callbacks.
   *
   * NOTE: We cannot use object spread here because RuntimeContextImpl exposes
   * its sub-APIs via getters. Spreading a getter-based object resolves the
   * getters at spread time, producing plain `undefined` values in the copy.
   * Instead we build a proper proxy object that delegates to the live context.
   */
  private buildTrackedContext(pluginName: string, context: RuntimeContext<TConfig>): RuntimeContext<TConfig> {
    const resources: Array<() => void> = [];
    this.pluginResources.set(pluginName, resources);

    const proxy: RuntimeContext<TConfig> = {
      get events() { return context.events; },
      get plugins() { return context.plugins; },
      get host() { return context.host; },
      get config() { return context.config; },
      get introspect() { return context.introspect; },
      get logger() { return context.logger; },
      get trace() { return context.trace; },
      getRuntime: () => context.getRuntime(),
      actions: {
        registerAction: (action) => {
          const unregister = context.actions.registerAction(action);
          resources.push(unregister);
          return unregister;
        },
        runAction: (id, params?) => context.actions.runAction(id, params),
        hasAction: (id) => context.actions.hasAction(id)
      },
      screens: {
        registerScreen: (screen) => {
          const unregister = context.screens.registerScreen(screen);
          resources.push(unregister);
          return unregister;
        },
        getScreen: (id) => context.screens.getScreen(id),
        getAllScreens: () => context.screens.getAllScreens()
      },
      services: {
        register: <T>(name: string, service: T) => {
          context.services.register(name, service);
          resources.push(() => context.services.unregister(name));
        },
        get: <T>(name: string): T => context.services.get<T>(name),
        has: (name) => context.services.has(name),
        list: () => context.services.list(),
        unregister: (name) => context.services.unregister(name)
      }
    };

    return proxy;
  }

  /**
   * Tears down a single plugin: calls dispose, then invokes all tracked
   * unregister callbacks in reverse registration order.
   */
  async teardownPlugin(pluginName: string, context: RuntimeContext<TConfig>): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (plugin?.dispose) {
      try {
        await plugin.dispose(context);
      } catch (err) {
        this.logger.error(`Plugin "${pluginName}" dispose failed during teardown`, err);
      }
    }
    const resources = this.pluginResources.get(pluginName) ?? [];
    for (let i = resources.length - 1; i >= 0; i--) {
      try { resources[i](); } catch { /* best-effort */ }
    }
    this.pluginResources.delete(pluginName);
    this.initializedPlugins = this.initializedPlugins.filter(n => n !== pluginName);
  }

  async executeSetup(context: RuntimeContext<TConfig>): Promise<void> {    const initialized: string[] = [];
    let failingPluginName: string | undefined;

    try {
      // Execute plugin setup callbacks sequentially in registration order
      for (const plugin of this.plugins.values()) {
        failingPluginName = plugin.name; // Track current plugin in case it fails

        // Dependency Validation (Requirement 14.7)
        if (plugin.dependencies && plugin.dependencies.length > 0) {
          for (const dep of plugin.dependencies) {
            // Check if dependency is present in registry
            if (!this.plugins.has(dep)) {
              throw new Error(`Plugin "${plugin.name}" requires missing dependency "${dep}"`);
            }
            // Check if dependency is already initialized (order matters)
            // Note: SCR processes plugins in registration order. If dependencies are registered but not yet initialized,
            // it implies a wrong order.
            if (!this.initializedPlugins.includes(dep)) {
              throw new Error(`Plugin "${plugin.name}" requires dependency "${dep}" to be initialized first`);
            }
          }
        }

        // Config Validation (v0.3 Feature)
        // Validate plugin config before setup if validateConfig is defined
        if (plugin.validateConfig) {
          const validationResult = await plugin.validateConfig(context.config);
          const isValid = typeof validationResult === 'boolean'
            ? validationResult
            : validationResult.valid;

          if (!isValid) {
            const errors = typeof validationResult === 'object' && validationResult.errors
              ? validationResult.errors.join(', ')
              : 'config validation failed';
            throw new ValidationError('Plugin', `config (${errors})`, plugin.name);
          }
          this.logger.debug(`Plugin "${plugin.name}" config validated successfully`);
        }

        // Support both sync and async setup callbacks
        const trackedCtx = this.buildTrackedContext(plugin.name, context);
        await plugin.setup(trackedCtx);
        // Track successfully initialized plugins
        initialized.push(plugin.name);
        this.initializedPlugins.push(plugin.name);
        this.logger.debug(`Plugin "${plugin.name}" initialized successfully`);      }
    } catch (error) {
      // Rollback: teardown already-initialized plugins in reverse order
      this.logger.error('Plugin setup failed, rolling back initialized plugins');
      for (let i = initialized.length - 1; i >= 0; i--) {
        await this.teardownPlugin(initialized[i], context);
        this.logger.debug(`Rolled back plugin: ${initialized[i]}`);
      }
      this.initializedPlugins = [];
      // Re-throw with context including plugin name
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Plugin "${failingPluginName}" setup failed: ${errorMessage}`);
    }
  }

  async executeDispose(context: RuntimeContext<TConfig>): Promise<void> {
    // Dispose in reverse order of initialization
    const order = [...this.initializedPlugins].reverse();
    for (const pluginName of order) {
      await this.teardownPlugin(pluginName, context);
      this.logger.debug(`Plugin "${pluginName}" disposed`);
    }
  }

  /**
   * Builds a tracked context for a single plugin and runs its setup.
   * Used by hot-swap to set up a replacement plugin with resource tracking.
   */
  async setupSinglePlugin(plugin: PluginDefinition<TConfig>, context: RuntimeContext<TConfig>): Promise<void> {
    const trackedCtx = this.buildTrackedContext(plugin.name, context);
    await plugin.setup(trackedCtx);
    this.initializedPlugins.push(plugin.name);
  }

  /**
   * Replaces an existing plugin definition in the registry (used by hot-swap).
   * Does not run setup/dispose — caller is responsible for lifecycle.
   */
  replacePlugin(plugin: PluginDefinition<TConfig>): void {
    this.plugins.set(plugin.name, plugin);
  }

  clear(): void {
    this.plugins.clear();
    this.initializedPlugins = [];
    this.pluginResources.clear();
  }
}
