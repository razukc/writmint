import { describe, it, expect, vi } from 'vitest';
import { PluginRegistry } from '../../src/plugin-registry.js';
import { PluginDefinition, RuntimeContext, Logger, ConsoleLogger, ValidationError, DuplicateRegistrationError } from '../../src/types.js';

// Mock RuntimeContext for testing
const createMockContext = (): RuntimeContext => ({
  screens: {
    registerScreen: vi.fn(),
    getScreen: vi.fn(),
    getAllScreens: vi.fn(),
  },
  actions: {
    registerAction: vi.fn(),
    runAction: vi.fn(),
  },
  plugins: {
    registerPlugin: vi.fn(),
    getPlugin: vi.fn(),
    getAllPlugins: vi.fn(),
    getInitializedPlugins: vi.fn(),
  },
  events: {
    emit: vi.fn(),
    emitAsync: vi.fn(),
    on: vi.fn(),
  },
  getRuntime: vi.fn(),
  logger: createMockLogger(),
  config: {},
  host: {},
  introspect: {
    getActions: vi.fn(),
    getAction: vi.fn(),
    getPlugins: vi.fn(),
    getPlugin: vi.fn(),
    getScreens: vi.fn(),
    getScreen: vi.fn(),
    getRuntimeMetadata: vi.fn(),
  }
} as any);

// Mock Logger for testing
const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('PluginRegistry', () => {
  describe('registerPlugin', () => {
    it('should register a valid plugin', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);

      expect(registry.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should throw DuplicateRegistrationError for duplicate plugin name', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const plugin1: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'test-plugin',
        version: '2.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin1);

      expect(() => registry.registerPlugin(plugin2)).toThrow(DuplicateRegistrationError);
      expect(() => registry.registerPlugin(plugin2)).toThrow(
        /\[validation\.duplicate_id\].*Plugin\[test-plugin\]/
      );
    });

    it('should validate required fields with ValidationError', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);

      expect(() =>
        registry.registerPlugin({} as PluginDefinition)
      ).toThrow(ValidationError);

      expect(() =>
        registry.registerPlugin({ name: 'test' } as PluginDefinition)
      ).toThrow(ValidationError);

      expect(() =>
        registry.registerPlugin({
          name: 'test',
          version: '1.0.0',
        } as PluginDefinition)
      ).toThrow(ValidationError);
    });
  });

  describe('executeSetup', () => {
    it('should execute plugin setup callbacks sequentially', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();
      const callOrder: number[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(() => {
          callOrder.push(1);
        }),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(() => {
          callOrder.push(2);
        }),
      };
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: vi.fn(() => {
          callOrder.push(3);
        }),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      registry.registerPlugin(plugin3);

      await registry.executeSetup(context);

      expect(callOrder).toEqual([1, 2, 3]);
      // Each plugin receives a tracked proxy that wraps the real context
      expect(plugin1.setup).toHaveBeenCalledOnce();
      expect(plugin2.setup).toHaveBeenCalledOnce();
      expect(plugin3.setup).toHaveBeenCalledOnce();
    });

    it('should support async setup callbacks', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();
      const callOrder: number[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          callOrder.push(1);
        }),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(() => {
          callOrder.push(2);
        }),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      await registry.executeSetup(context);

      expect(callOrder).toEqual([1, 2]);
    });

    it('should track successfully initialized plugins', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      // Verify by checking that dispose will be called for this plugin
      const disposePlugin: PluginDefinition = {
        name: 'dispose-test',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };

      registry.registerPlugin(disposePlugin);
      await registry.executeSetup(context);
      await registry.executeDispose(context);

      expect(disposePlugin.dispose).toHaveBeenCalled();
    });

    it('should abort on first plugin setup failure and rollback', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(() => {
          throw new Error('Setup failed');
        }),
        dispose: vi.fn(),
      };
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      registry.registerPlugin(plugin3);

      await expect(registry.executeSetup(context)).rejects.toThrow(
        'Plugin "plugin-2" setup failed: Setup failed'
      );

      expect(plugin1.setup).toHaveBeenCalled();
      expect(plugin2.setup).toHaveBeenCalled();
      expect(plugin3.setup).not.toHaveBeenCalled();

      // Verify rollback: plugin1 should have dispose called
      expect(plugin1.dispose).toHaveBeenCalledWith(context);
      expect(plugin2.dispose).not.toHaveBeenCalled();

      // Verify logger was called for rollback
      expect(logger.error).toHaveBeenCalledWith('Plugin setup failed, rolling back initialized plugins');
    });

    it('should include plugin name in error message', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: vi.fn(() => {
          throw new Error('Custom error');
        }),
      };

      registry.registerPlugin(plugin);

      await expect(registry.executeSetup(context)).rejects.toThrow(
        'Plugin "failing-plugin" setup failed: Custom error'
      );
    });

    it('should validate plugin config before setup if validateConfig is defined', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();
      (context as any).config = { valid: true };

      const plugin: PluginDefinition = {
        name: 'validated-plugin',
        version: '1.0.0',
        validateConfig: vi.fn(() => ({ valid: true })),
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      expect(plugin.validateConfig).toHaveBeenCalledWith(context.config);
      expect(plugin.setup).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Plugin "validated-plugin" config validated successfully');
    });

    it('should support boolean return value from validateConfig', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'boolean-validated-plugin',
        version: '1.0.0',
        validateConfig: vi.fn(() => true),
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      expect(plugin.setup).toHaveBeenCalled();
    });

    it('should throw ValidationError when validateConfig returns false', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'invalid-plugin',
        version: '1.0.0',
        validateConfig: vi.fn(() => false),
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);

      await expect(registry.executeSetup(context)).rejects.toThrow(Error);
      await expect(registry.executeSetup(context)).rejects.toThrow(
        /Plugin "invalid-plugin" setup failed: \[validation\.invalid_field\].*Plugin\[invalid-plugin\]\.config \(config validation failed\)/
      );
      expect(plugin.setup).not.toHaveBeenCalled();
    });

    it('should throw ValidationError with custom errors from validateConfig result', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'custom-error-plugin',
        version: '1.0.0',
        validateConfig: vi.fn(() => ({
          valid: false,
          errors: ['API key missing', 'Invalid region']
        })),
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);

      await expect(registry.executeSetup(context)).rejects.toThrow(
        /Plugin "custom-error-plugin" setup failed: \[validation\.invalid_field\].*Plugin\[custom-error-plugin\]\.config \(API key missing, Invalid region\)/
      );
    });

    it('should support async validateConfig', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'async-validated-plugin',
        version: '1.0.0',
        validateConfig: vi.fn(async () => {
          await new Promise(r => setTimeout(r, 10));
          return { valid: true };
        }),
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      expect(plugin.setup).toHaveBeenCalled();
    });
  });

  describe('executeDispose', () => {
    it('should execute dispose only for initialized plugins', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(() => {
          throw new Error('Setup failed');
        }),
        dispose: vi.fn(),
      };
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      registry.registerPlugin(plugin3);

      // Setup will fail on plugin-2, rollback will dispose plugin-1
      await expect(registry.executeSetup(context)).rejects.toThrow();

      // After rollback, initializedPlugins should be empty
      // So executeDispose should not call any dispose
      vi.clearAllMocks();
      await registry.executeDispose(context);

      expect(plugin1.dispose).not.toHaveBeenCalled();
      expect(plugin2.dispose).not.toHaveBeenCalled();
      expect(plugin3.dispose).not.toHaveBeenCalled();
    });

    it('should execute dispose in reverse order of setup', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();
      const callOrder: number[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          callOrder.push(1);
        }),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          callOrder.push(2);
        }),
      };
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          callOrder.push(3);
        }),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      registry.registerPlugin(plugin3);

      await registry.executeSetup(context);
      await registry.executeDispose(context);

      // Dispose should be in reverse order: 3, 2, 1
      expect(callOrder).toEqual([3, 2, 1]);
    });

    it('should log dispose errors but continue cleanup', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          throw new Error('Dispose error 1');
        }),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          throw new Error('Dispose error 3');
        }),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      registry.registerPlugin(plugin3);

      await registry.executeSetup(context);
      await registry.executeDispose(context);

      // Verify logger was called with errors
      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "plugin-3" dispose failed during teardown',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "plugin-1" dispose failed during teardown',
        expect.any(Error)
      );
      expect(plugin2.dispose).toHaveBeenCalled();
    });

    it('should skip plugins without dispose callback', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      await registry.executeSetup(context);
      await registry.executeDispose(context);

      expect(plugin2.dispose).toHaveBeenCalled();
    });

    it('should support async dispose callbacks', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();
      const callOrder: number[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          callOrder.push(1);
        }),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(() => {
          callOrder.push(2);
        }),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      await registry.executeSetup(context);
      await registry.executeDispose(context);

      // Dispose in reverse order: 2, 1
      expect(callOrder).toEqual([2, 1]);
    });
  });

  describe('getPlugin', () => {
    it('should return plugin by name', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);

      expect(registry.getPlugin('test-plugin')).toBe(plugin);
    });

    it('should return null for non-existent plugin', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);

      expect(registry.getPlugin('non-existent')).toBeNull();
    });
  });

  describe('getAllPlugins', () => {
    it('should return all registered plugins', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      const allPlugins = registry.getAllPlugins();
      expect(allPlugins).toHaveLength(2);
      expect(allPlugins).toContain(plugin1);
      expect(allPlugins).toContain(plugin2);
    });

    it('should return empty array when no plugins registered', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);

      expect(registry.getAllPlugins()).toEqual([]);
    });

    it('should return array copy to prevent external mutation', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);

      const allPlugins1 = registry.getAllPlugins();
      const allPlugins2 = registry.getAllPlugins();

      expect(allPlugins1).not.toBe(allPlugins2);
      expect(allPlugins1).toEqual(allPlugins2);
    });
  });

  describe('getInitializedPlugins', () => {
    it('should return initialized plugin names in order', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: vi.fn(),
      };
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);
      await registry.executeSetup(context);

      const initialized = registry.getInitializedPlugins();
      expect(initialized).toEqual(['plugin-1', 'plugin-2']);
    });

    it('should return empty array before initialization', () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);

      expect(registry.getInitializedPlugins()).toEqual([]);
    });

    it('should return array copy to prevent external mutation', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      const initialized1 = registry.getInitializedPlugins();
      const initialized2 = registry.getInitializedPlugins();

      expect(initialized1).not.toBe(initialized2);
      expect(initialized1).toEqual(initialized2);
    });
  });

  describe('clear', () => {
    it('should remove all plugins and initialized state', async () => {
      const logger = createMockLogger();
      const registry = new PluginRegistry(logger);
      const context = createMockContext();

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn(),
        dispose: vi.fn(),
      };

      registry.registerPlugin(plugin);
      await registry.executeSetup(context);

      registry.clear();

      expect(registry.getPlugin('test-plugin')).toBeNull();
      expect(registry.getAllPlugins()).toEqual([]);
      expect(registry.getInitializedPlugins()).toEqual([]);

      // After clear, dispose should not be called since initialized state is cleared
      await registry.executeDispose(context);
      expect(plugin.dispose).not.toHaveBeenCalled();
    });
  });
});
