import type { RuntimeContext, ScreenDefinition, ActionDefinition, PluginDefinition, IntrospectionAPI, Logger, ExecutionRecorder } from './types.js';
import type { ScreenRegistry } from './screen-registry.js';
import type { ActionEngine } from './action-engine.js';
import type { PluginRegistry } from './plugin-registry.js';
import type { EventBus } from './event-bus.js';
import type { Runtime } from './runtime.js';
import type { ServiceRegistry } from './service-registry.js';
import { ExecutionRecorderImpl } from './execution-recorder.js';

/**
 * Deep freeze utility - recursively freezes an object and all nested objects.
 * Internal use only, not exported.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 * 
 * @param obj - The object to deep freeze
 * @returns The frozen object with proper typing
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  // Freeze the object itself (Requirement 7.1)
  Object.freeze(obj);

  // Iterate over all properties (Requirement 7.2)
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop];

    // Skip functions (Requirement 7.4)
    if (typeof value === 'function') {
      return;
    }

    // Skip already frozen objects (Requirement 7.5)
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      // Recursively freeze nested objects and arrays (Requirements 7.2, 7.3)
      deepFreeze(value);
    }
  });

  return obj as Readonly<T>;
}

/**
 * RuntimeContext provides a safe API facade for subsystems.
 * Passed to plugins and action handlers without exposing internal mutable structures.
 * 
 * Requirements: 1.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
export class RuntimeContextImpl<TConfig = Record<string, unknown>> implements RuntimeContext<TConfig> {
  private screenRegistry: ScreenRegistry;
  private actionEngine: ActionEngine<TConfig>;
  private pluginRegistry: PluginRegistry<TConfig>;
  private eventBus: EventBus;
  private serviceRegistry: ServiceRegistry;
  private runtime: Runtime<TConfig>;
  private frozenHostContext: Readonly<Record<string, unknown>>;
  private introspectionAPI: IntrospectionAPI;
  private loggerInstance: Logger;
  private executionRecorder: ExecutionRecorderImpl;

  // Cache API objects to prevent memory leaks from repeated access
  private cachedScreensAPI: any;
  private cachedActionsAPI: any;
  private cachedPluginsAPI: any;
  private cachedEventsAPI: any;
  private cachedServicesAPI: any;

  constructor(
    screenRegistry: ScreenRegistry,
    actionEngine: ActionEngine<TConfig>,
    pluginRegistry: PluginRegistry<TConfig>,
    eventBus: EventBus,
    serviceRegistry: ServiceRegistry,
    runtime: Runtime<TConfig>,
    hostContext: Record<string, unknown>,
    logger: Logger,
    recorder?: ExecutionRecorderImpl
  ) {
    this.screenRegistry = screenRegistry;
    this.actionEngine = actionEngine;
    this.pluginRegistry = pluginRegistry;
    this.eventBus = eventBus;
    this.serviceRegistry = serviceRegistry;
    this.runtime = runtime;
    this.loggerInstance = logger;
    this.frozenHostContext = Object.freeze({ ...hostContext });

    // Use injected recorder or create a standalone one (e.g. in tests)
    this.executionRecorder = recorder ?? new ExecutionRecorderImpl();

    // Cache the introspection API to avoid creating new objects on every access
    // This prevents memory leaks when introspection is used repeatedly
    this.introspectionAPI = this.createIntrospectionAPI();

    // Pre-create and cache API objects to prevent memory leaks
    this.cachedScreensAPI = this.createScreensAPI();
    this.cachedActionsAPI = this.createActionsAPI();
    this.cachedPluginsAPI = this.createPluginsAPI();
    this.cachedEventsAPI = this.createEventsAPI();
    this.cachedServicesAPI = this.createServicesAPI();
  }

  /**
   * Screens API - exposes Screen Registry operations
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.2, 10.3, 10.4, 10.5
   */
  get screens() {
    return this.cachedScreensAPI;
  }

  private createScreensAPI() {
    return {
      registerScreen: (screen: ScreenDefinition): (() => void) => {
        return this.screenRegistry.registerScreen(screen);
      },
      getScreen: (id: string): ScreenDefinition | null => {
        return this.screenRegistry.getScreen(id);
      },
      getAllScreens: (): ScreenDefinition[] => {
        return this.screenRegistry.getAllScreens();
      }
    };
  }

  /**
   * Actions API - exposes Action Engine operations
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  get actions() {
    return this.cachedActionsAPI;
  }

  private createActionsAPI() {
    return {
      registerAction: <P = unknown, R = unknown>(action: ActionDefinition<P, R, TConfig>): (() => void) => {
        return this.actionEngine.registerAction(action);
      },
      runAction: <P = unknown, R = unknown>(id: string, params?: P): Promise<R> => {
        return this.actionEngine.runAction(id, params);
      },
      hasAction: (id: string): boolean => {
        return this.actionEngine.hasAction(id);
      }
    };
  }

  /**
   * Plugins API - exposes Plugin Registry operations
   * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
   */
  get plugins() {
    return this.cachedPluginsAPI;
  }

  private createPluginsAPI() {
    return {
      registerPlugin: (plugin: PluginDefinition<TConfig>): void => {
        this.pluginRegistry.registerPlugin(plugin);
      },
      getPlugin: (name: string): PluginDefinition<TConfig> | null => {
        return this.pluginRegistry.getPlugin(name);
      },
      getAllPlugins: (): PluginDefinition<TConfig>[] => {
        return this.pluginRegistry.getAllPlugins();
      },
      getInitializedPlugins: (): string[] => {
        return this.pluginRegistry.getInitializedPlugins();
      },
      isInitialized: (name: string): boolean => {
        return this.pluginRegistry.isInitialized(name);
      }
    };
  }

  /**
   * Events API - exposes Event Bus operations
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
   */
  get events() {
    return this.cachedEventsAPI;
  }

  private createEventsAPI() {
    return {
      emit: (event: string, data?: unknown): void => {
        this.eventBus.emit(event, data);
      },
      emitAsync: (event: string, data?: unknown): Promise<void> => {
        return this.eventBus.emitAsync(event, data);
      },
      on: (event: string, handler: (data: unknown) => void): (() => void) => {
        return this.eventBus.on(event, handler);
      }
    };
  }

  /**
   * Services API - exposes Service Registry operations for typed inter-plugin communication.
   * Requirements: v0.3 Service Locator Feature
   */
  get services() {
    return this.cachedServicesAPI;
  }

  private createServicesAPI() {
    return {
      register: <T>(name: string, service: T): void => {
        this.serviceRegistry.register(name, service);
      },
      get: <T>(name: string): T => {
        return this.serviceRegistry.get<T>(name);
      },
      has: (name: string): boolean => {
        return this.serviceRegistry.has(name);
      },
      list: (): string[] => {
        return this.serviceRegistry.list();
      },
      unregister: (name: string): void => {
        this.serviceRegistry.unregister(name);
      }
    };
  }

  /**
   * Returns the Runtime instance
   * Requirement: 9.6
   */
  getRuntime(): Runtime<TConfig> {
    return this.runtime;
  }

  /**
   * Logger instance for plugins to use
   */
  get logger(): Logger {
    return this.loggerInstance;
  }

  /**
   * Execution recorder — observe every action run.
   */
  get trace(): ExecutionRecorder {
    return this.executionRecorder;
  }

  /**
   * Returns the internal recorder so Runtime can wire it to ActionEngine.
   * Not part of the public RuntimeContext interface.
   */
  getRecorder(): ExecutionRecorderImpl {
    return this.executionRecorder;
  }

  /**
   * Host context - readonly access to injected host services
   * Requirements: 1.2, 1.3, 1.4
   * 
   * Returns a cached frozen shallow copy of the host context to prevent mutation.
   * This ensures plugins can access host services but cannot modify them.
   * The frozen copy is cached to avoid memory leaks from repeated access.
   */
  get host(): Readonly<Record<string, unknown>> {
    return this.frozenHostContext;
  }

  /**
   * Synchronous access to runtime configuration.
   */
  get config(): Readonly<TConfig> {
    return this.runtime.getConfig();
  }

  /**
   * Introspection API - query runtime metadata
   * Requirements: 3.1, 4.1, 5.1, 6.1
   * 
   * Returns a cached introspection API object to prevent memory leaks
   * from repeated access.
   */
  get introspect(): IntrospectionAPI {
    return this.introspectionAPI;
  }

  /**
   * Creates the introspection API object.
   * Called once during construction and cached.
   */
  private createIntrospectionAPI(): IntrospectionAPI {
    return {
      /**
       * List all registered action IDs
       * Requirements: 3.1
       */
      listActions: (): string[] => {
        return this.actionEngine.getAllActions().map(action => action.id);
      },

      /**
       * Get action metadata by ID (excludes handler function)
       * Requirements: 3.2, 3.3, 3.4, 3.5
       */
      getActionDefinition: (id: string) => {
        const action = this.actionEngine.getAction(id);
        if (!action) return null;

        // Extract only id, timeout, retry, memoryLimitMb, description (exclude handler function)
        const metadata = {
          id: action.id,
          timeout: action.timeout,
          retry: action.retry,
          memoryLimitMb: action.memoryLimitMb,
          description: action.description
        };

        // Deep freeze the metadata
        return deepFreeze(metadata);
      },

      /**
       * List all registered plugin names
       * Requirements: 4.1
       */
      listPlugins: (): string[] => {
        return this.pluginRegistry.getAllPlugins().map(plugin => plugin.name);
      },

      /**
       * Get plugin metadata by name (excludes setup/dispose functions)
       * Requirements: 4.2, 4.3, 4.4, 4.5
       */
      getPluginDefinition: (name: string) => {
        const plugin = this.pluginRegistry.getPlugin(name);
        if (!plugin) return null;

        // Extract only name, version, description (exclude setup/dispose functions)
        const metadata = {
          name: plugin.name,
          version: plugin.version,
          description: plugin.description
        };

        // Deep freeze the metadata
        return deepFreeze(metadata);
      },

      /**
       * List all registered screen IDs
       * Requirements: 5.1
       */
      listScreens: (): string[] => {
        return this.screenRegistry.getAllScreens().map(screen => screen.id);
      },

      /**
       * Get screen definition by ID (includes all properties)
       * Requirements: 5.2, 5.3, 5.4, 5.5
       */
      getScreenDefinition: (id: string) => {
        const screen = this.screenRegistry.getScreen(id);
        if (!screen) return null;

        // Include all screen properties
        const metadata = {
          id: screen.id,
          title: screen.title,
          component: screen.component
        };

        // Deep freeze the metadata
        return deepFreeze(metadata);
      },

      /**
       * Get runtime metadata with statistics
       * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
       */
      getMetadata: () => {
        const metadata = {
          runtimeVersion: '0.1.0',
          totalActions: this.actionEngine.getAllActions().length,
          totalPlugins: this.pluginRegistry.getAllPlugins().length,
          totalScreens: this.screenRegistry.getAllScreens().length
        };

        // Deep freeze the metadata
        return deepFreeze(metadata);
      }
    };
  }
}
