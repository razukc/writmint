import type { RuntimeContext, UIProvider, PluginDefinition, RuntimeOptions, Logger, PluginLoader } from './types.js';
import { ConsoleLogger, RuntimeState, PluginSwapError } from './types.js';
import { PluginRegistry, isNewerVersion } from './plugin-registry.js';
import { ScreenRegistry } from './screen-registry.js';
import { ActionEngine } from './action-engine.js';
import { EventBus } from './event-bus.js';
import { UIBridge } from './ui-bridge.js';
import { RuntimeContextImpl } from './runtime-context.js';
import { createPerformanceMonitor, type PerformanceMonitor } from './performance.js';
import { ServiceRegistry } from './service-registry.js';
import { ExecutionRecorderImpl } from './execution-recorder.js';

/**
 * Runtime is the main orchestrator that coordinates all subsystems.
 * Handles initialization, shutdown, and lifecycle state tracking.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.7, 9.9, 15.1, 15.3, 15.5, 16.1, 16.2, 16.3, 16.4, 16.5
 */
export class Runtime<TConfig = Record<string, unknown>> {
  private plugins!: PluginRegistry<TConfig>;
  private screens!: ScreenRegistry;
  private actions!: ActionEngine<TConfig>;
  private events!: EventBus;
  private services!: ServiceRegistry;
  private ui!: UIBridge<TConfig>;
  private context!: RuntimeContext<TConfig>;
  private initialized: boolean = false;
  private pendingPlugins: PluginDefinition<TConfig>[] = [];
  public readonly logger: Logger;
  private state: RuntimeState = RuntimeState.Uninitialized;
  private hostContext: Record<string, unknown>;
  private config: TConfig; // [NEW] Stored config
  private performanceMonitor: PerformanceMonitor;
  private pluginLoader?: PluginLoader;
  private pluginPaths: string[];
  private pluginPackages: string[];

  /**
   * Creates a new Runtime instance with optional configuration.
   * 
   * @param options - Optional configuration object
   * @param options.logger - Custom logger implementation (defaults to ConsoleLogger)
   * @param options.hostContext - Host application services to inject (defaults to empty object)
   * 
   * Requirements: 1.1, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
   */
  constructor(options?: RuntimeOptions<TConfig>) {
    this.logger = options?.logger ?? new ConsoleLogger();
    this.hostContext = options?.hostContext ?? {};
    // Ensure config is always an object and frozen initially
    this.config = options?.config ? { ...options.config } as TConfig : {} as TConfig;
    if (this.config && typeof this.config === 'object') {
      Object.freeze(this.config);
    }
    this.performanceMonitor = createPerformanceMonitor(options?.enablePerformanceMonitoring ?? false);

    // Plugin discovery setup
    this.pluginLoader = options?.pluginLoader;
    this.pluginPaths = options?.pluginPaths ?? [];
    this.pluginPackages = options?.pluginPackages ?? [];

    this.validateHostContext(this.hostContext);
  }

  /**
   * Validates host context and logs warnings for common mistakes.
   * Does not throw errors or modify the context.
   * 
   * @param context - The host context to validate
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  private validateHostContext(context: Record<string, unknown>): void {
    // Fast path for empty context
    if (Object.keys(context).length === 0) {
      return;
    }

    // Check each key in the context
    Object.entries(context).forEach(([key, value]) => {
      // Check for large objects (> 1MB)
      try {
        const size = JSON.stringify(value).length;
        if (size > 1024 * 1024) {
          this.logger.warn(`Host context key "${key}" is large (${size} bytes)`);
        }
      } catch (error) {
        // JSON.stringify can fail for circular references or other issues
        // Log but don't fail validation
        this.logger.warn(`Host context key "${key}" could not be serialized for size check`);
      }

      // Check for function values
      if (typeof value === 'function') {
        this.logger.warn(`Host context key "${key}" is a function. Consider wrapping it in an object.`);
      }
    });
  }

  /**
   * Registers a plugin before initialization.
   * Plugins registered this way will have their setup callbacks executed during initialize().
   * 
   * @param plugin - The plugin definition to register
   * @throws Error if runtime is already initialized
   */
  registerPlugin(plugin: PluginDefinition<TConfig>): void {
    if (this.initialized) {
      throw new Error('Cannot register plugins after initialization. Use context.plugins.registerPlugin() instead.');
    }
    this.pendingPlugins.push(plugin);
  }

  /**
   * Initializes the runtime following the strict initialization sequence.
   * Creates all subsystems in order, then executes plugin setup callbacks.
   * Emits runtime:initialized event after successful initialization.
   * 
   * @throws Error if initialize is called twice
   * @throws Error if any plugin setup fails
   * 
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.5, 15.1, 15.3, 15.5, 16.1, 16.2, 16.3, 16.4, 16.5, 17.1, 17.2, 17.3
   */
  async initialize(): Promise<void> {
    // Throw error if initialize called twice (Requirement 15.1)
    if (this.initialized) {
      throw new Error('Runtime already initialized');
    }

    // Set state to Initializing (Requirement 16.2)
    this.state = RuntimeState.Initializing;

    const timer = this.performanceMonitor.startTimer('runtime:initialize');

    try {
      // Strict initialization sequence (Requirements 2.1, 2.2, 2.3, 2.4)

      // 1. Create PluginRegistry (Requirement 2.1)
      this.plugins = new PluginRegistry<TConfig>(this.logger);

      // Load plugins from discovery paths/packages (v0.2.1)
      if (this.pluginPaths.length > 0 || this.pluginPackages.length > 0) {
        if (!this.pluginLoader) {
          this.logger.warn('Plugin paths/packages specified but no plugin loader configured. Skipping discovery.');
        } else {
          this.logger.info('Loading plugins via configured PluginLoader...');
          const discoveredPlugins = await this.pluginLoader.loadPlugins(
            this.pluginPaths,
            this.pluginPackages
          );

          // Register discovered plugins (cast to correct type for compatibility)
          for (const plugin of discoveredPlugins) {
            this.plugins.registerPlugin(plugin as PluginDefinition<TConfig>);
          }
        }
      }

      // Register pending plugins (manually registered)
      for (const plugin of this.pendingPlugins) {
        this.plugins.registerPlugin(plugin);
      }
      this.pendingPlugins = [];

      // 2. Create ScreenRegistry (Requirement 2.2)
      this.screens = new ScreenRegistry(this.logger);

      // 3. Create ExecutionRecorder + ActionEngine (recorder wired at construction)
      const recorder = new ExecutionRecorderImpl();
      this.actions = new ActionEngine<TConfig>(this.logger, (entry) => recorder.record(entry));

      // 4. Create EventBus (Requirement 2.4)
      this.events = new EventBus(this.logger);

      // 5. Create ServiceRegistry (v0.3 Feature)
      this.services = new ServiceRegistry(this.logger);

      // 6. Create UIBridge
      this.ui = new UIBridge<TConfig>(this.logger);

      // 7. Create RuntimeContext after all subsystems (Requirements 1.2, 2.4, 9.7)
      this.context = new RuntimeContextImpl<TConfig>(
        this.screens,
        this.actions,
        this.plugins,
        this.events,
        this.services,
        this,
        this.hostContext,
        this.logger,
        recorder
      );

      // 8. Pass RuntimeContext to ActionEngine (Requirement 9.9)
      this.actions.setContext(this.context);

      // 9. Execute plugin setup callbacks in registration order (Requirements 2.5, 2.6, 3.1)
      // This will abort on first plugin setup failure (Requirement 3.1)
      await this.plugins.executeSetup(this.context);

      // Mark as initialized
      this.initialized = true;

      // Set state to Initialized (Requirement 16.2)
      this.state = RuntimeState.Initialized;

      // Emit runtime:initialized event (Requirements 17.1, 17.2, 17.3)
      this.events.emit('runtime:initialized', { context: this.context });

      // Record initialization performance
      timer();
    } catch (error) {
      // Reset state to Uninitialized on failure (Requirement 16.5)
      this.state = RuntimeState.Uninitialized;
      timer(); // Still record timing for failed initializations
      throw error;
    }
  }

  /**
   * Shuts down the runtime following the strict shutdown sequence.
   * Emits runtime:shutdown event at start of shutdown.
   * Disposes initialized plugins, shuts down UI provider, clears all registries, and releases resources.
   * Safe to call multiple times (idempotent).
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.5, 15.2, 15.4, 15.6, 16.1, 16.2, 16.3, 16.4, 16.5, 17.4, 17.5
   */
  async shutdown(): Promise<void> {
    // Make shutdown idempotent - safe to call multiple times (Requirement 4.5)
    if (!this.initialized) {
      return;
    }

    // Set state to ShuttingDown (Requirement 16.4)
    this.state = RuntimeState.ShuttingDown;

    // Emit runtime:shutdown event (Requirements 17.4, 17.5)
    this.events.emit('runtime:shutdown', { context: this.context });

    // 1. Execute dispose callbacks only for initialized plugins (Requirements 4.2, 4.3)
    // Dispose errors are logged but do not prevent cleanup (Requirement 4.4)
    await this.plugins.executeDispose(this.context);

    // 2. Shutdown UI provider before clearing registries (Requirement 9.5)
    // Handle shutdown errors gracefully - errors are logged but do not prevent cleanup
    try {
      await this.ui.shutdown();
    } catch (error) {
      this.logger.error('UIBridge shutdown failed', error);
    }

    // 3. Clear all registries (Requirement 4.5)
    this.screens.clear();
    this.actions.clear();
    this.events.clear();
    this.plugins.clear();
    this.services.clear();

    // 4. Clear context reference in ActionEngine to break circular reference
    this.actions.setContext(null as any);

    // 5. Set initialized flag to false (Requirement 4.5)
    this.initialized = false;

    // Set state to Shutdown (Requirement 16.4)
    this.state = RuntimeState.Shutdown;
  }

  /**
   * Returns the RuntimeContext for this runtime instance.
   * 
   * @returns The RuntimeContext
   * @throws Error if runtime is not initialized
   * 
   * Requirement: 9.1
   */
  getContext(): RuntimeContext<TConfig> {
    if (!this.initialized) {
      throw new Error('Runtime not initialized');
    }
    return this.context;
  }

  /**
   * Returns whether the runtime has been initialized.
   * 
   * @returns true if runtime is initialized, false otherwise
   * 
   * Requirements: 16.1, 16.2, 16.3
   */
  isInitialized(): boolean {
    return this.state === RuntimeState.Initialized;
  }

  /**
   * Returns the current lifecycle state of the runtime.
   * 
   * @returns The current RuntimeState
   * 
   * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
   */
  getState(): RuntimeState {
    return this.state;
  }

  /**
   * Registers a UI provider with the runtime.
   * Delegates to UIBridge subsystem.
   * Can be called after initialization completes.
   * 
   * @param provider - The UI provider implementation
   * @throws Error if provider is invalid or already registered
   * 
   * Requirements: 10.3, 10.9
   */
  setUIProvider(provider: UIProvider<TConfig>): void {
    this.ui.setProvider(provider);
  }

  /**
   * Returns the registered UI provider.
   * Delegates to UIBridge subsystem.
   * 
   * @returns The registered UIProvider or null if none registered
   * 
   * Requirement: 10.4
   */
  getUIProvider(): UIProvider<TConfig> | null {
    return this.ui.getProvider();
  }

  /**
   * Renders a screen by looking it up in the ScreenRegistry and delegating to UIBridge.
   * 
   * @param screenId - The screen identifier to render
   * @returns The result from the UI provider's render method
   * @throws Error if screen is not found
   * @throws Error if no UI provider is registered
   * 
   * Requirement: 10.5
   */
  renderScreen(screenId: string): unknown {
    // Look up the screen in the registry
    const screen = this.screens.getScreen(screenId);

    // Throw if screen not found
    if (screen === null) {
      throw new Error(`Screen with id "${screenId}" not found`);
    }

    // Delegate to UIBridge to render the screen
    return this.ui.renderScreen(screen);
  }
  /**
   * Hot-swaps a running plugin with a new version.
   * Requires the new plugin to have the same name and a strictly higher semver version.
   * Sequence: validate → dispose old → tear down resources → register new → setup new → emit plugin:swapped.
   * @throws PluginSwapError if preconditions are not met.
   */
  async swapPlugin(newPlugin: PluginDefinition<TConfig>): Promise<void> {
    if (!this.initialized) {
      throw new PluginSwapError(newPlugin.name, 'runtime is not initialized');
    }

    const existing = this.plugins.getPlugin(newPlugin.name);
    if (!existing) {
      throw new PluginSwapError(newPlugin.name, 'plugin is not registered');
    }
    if (!this.plugins.isInitialized(newPlugin.name)) {
      throw new PluginSwapError(newPlugin.name, 'plugin is not initialized');
    }
    if (!isNewerVersion(existing.version, newPlugin.version)) {
      throw new PluginSwapError(
        newPlugin.name,
        `new version "${newPlugin.version}" must be strictly greater than current "${existing.version}"`
      );
    }

    this.logger.info(`[hot-swap] Swapping plugin "${newPlugin.name}" ${existing.version} → ${newPlugin.version}`);

    // 1. Dispose old plugin and tear down all its registered resources
    await this.plugins.teardownPlugin(newPlugin.name, this.context);

    // 2. Replace the plugin definition in the registry
    this.plugins.replacePlugin(newPlugin);

    // 3. Config validation for new plugin
    if (newPlugin.validateConfig) {
      const result = await newPlugin.validateConfig(this.context.config);
      const valid = typeof result === 'boolean' ? result : result.valid;
      if (!valid) {
        const errors = typeof result === 'object' && result.errors ? result.errors.join(', ') : 'config validation failed';
        throw new PluginSwapError(newPlugin.name, `config validation failed: ${errors}`);
      }
    }

    // 4. Run new plugin setup with resource tracking
    try {
      await this.plugins.setupSinglePlugin(newPlugin, this.context);
    } catch (err) {
      // Rollback: tear down whatever the new plugin registered before failing
      await this.plugins.teardownPlugin(newPlugin.name, this.context);
      throw new PluginSwapError(newPlugin.name, `new plugin setup failed: ${(err as Error).message}`);
    }

    // 5. Emit event
    this.events.emit('plugin:swapped', {
      name: newPlugin.name,
      previousVersion: existing.version,
      newVersion: newPlugin.version
    });

    this.logger.info(`[hot-swap] Plugin "${newPlugin.name}" successfully swapped to ${newPlugin.version}`);
  }

  /**
   * Returns the current runtime configuration.
   * @returns Readonly config object
   */
  getConfig(): Readonly<TConfig> {
    return this.config;
  }

  /**
   * Updates the runtime configuration.
   * Merges the new config with the existing one and freezes it.
   * @param config - Partial config to update
   */
  updateConfig(config: Partial<TConfig>): void {
    if (!this.config || typeof this.config !== 'object') {
      this.config = config as TConfig;
    } else {
      this.config = { ...this.config, ...config };
    }
    Object.freeze(this.config);
  }
}
