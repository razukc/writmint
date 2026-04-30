import { describe, it, expect, vi } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import { ScreenRegistry } from '../../src/screen-registry.js';
import { ActionEngine } from '../../src/action-engine.js';
import { PluginRegistry } from '../../src/plugin-registry.js';
import { ConsoleLogger, DuplicateRegistrationError } from '../../src/types.js';
import type { PluginDefinition, ScreenDefinition, ActionDefinition, RuntimeContext } from '../../src/types.js';

// Mock RuntimeContext for ActionEngine tests
function createMockContext(): RuntimeContext {
  return {
    screens: {
      registerScreen: () => () => {},
      getScreen: () => null,
      getAllScreens: () => []
    },
    actions: {
      registerAction: () => () => {},
      runAction: async () => undefined as any
    },
    plugins: {
      registerPlugin: () => {},
      getPlugin: () => null,
      getAllPlugins: () => [],
      getInitializedPlugins: () => []
    },
    events: {
      emit: () => {},
      emitAsync: async () => {},
      on: () => () => {}
    },
    getRuntime: () => ({
      initialize: async () => {},
      shutdown: async () => {},
      getContext: () => createMockContext()
    })
  };
}

describe('Error Scenario Tests', () => {
  describe('Duplicate screen ID error message', () => {
    it('should include screen ID in duplicate error message', () => {
      // Requirement: 16.1
      const logger = new ConsoleLogger();
      const registry = new ScreenRegistry(logger);
      const screenId = 'my-unique-screen-id';
      
      const screen1: ScreenDefinition = {
        id: screenId,
        title: 'First Screen',
        component: 'Component1'
      };
      
      const screen2: ScreenDefinition = {
        id: screenId,
        title: 'Second Screen',
        component: 'Component2'
      };
      
      registry.registerScreen(screen1);
      
      try {
        registry.registerScreen(screen2);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateRegistrationError);
        expect((error as Error).message).toContain(screenId);
        expect((error as Error).message).toContain('my-unique-screen-id');
      }
    });
  });

  describe('Duplicate action ID error message', () => {
    it('should include action ID in duplicate error message', () => {
      // Requirement: 16.2
      const logger = new ConsoleLogger();
      const engine = new ActionEngine(logger);
      const actionId = 'my-unique-action-id';
      
      const action1: ActionDefinition = {
        id: actionId,
        handler: () => 'result1'
      };
      
      const action2: ActionDefinition = {
        id: actionId,
        handler: () => 'result2'
      };
      
      engine.registerAction(action1);
      
      try {
        engine.registerAction(action2);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(actionId);
        expect((error as Error).message).toContain('my-unique-action-id');
      }
    });
  });

  describe('Duplicate plugin name error message', () => {
    it('should include plugin name in duplicate error message', () => {
      // Requirement: 16.3
      const logger = new ConsoleLogger();
      const registry = new PluginRegistry(logger);
      const pluginName = 'my-unique-plugin-name';
      
      const plugin1: PluginDefinition = {
        name: pluginName,
        version: '1.0.0',
        setup: () => {}
      };
      
      const plugin2: PluginDefinition = {
        name: pluginName,
        version: '2.0.0',
        setup: () => {}
      };
      
      registry.registerPlugin(plugin1);
      
      try {
        registry.registerPlugin(plugin2);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(pluginName);
        expect((error as Error).message).toContain('my-unique-plugin-name');
      }
    });
  });

  describe('Missing action error message', () => {
    it('should include action ID in missing action error message', async () => {
      // Requirement: 16.4
      const logger = new ConsoleLogger();
      const engine = new ActionEngine(logger);
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const missingActionId = 'non-existent-action-id';
      
      try {
        await engine.runAction(missingActionId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(missingActionId);
        expect((error as Error).message).toContain('non-existent-action-id');
      }
    });
  });

  describe('Missing UI provider error message', () => {
    it('should have clear error message when renderScreen called without UI provider', async () => {
      // Requirement: 16.5
      const runtime = new Runtime();
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Register a screen
      context.screens.registerScreen({
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });
      
      try {
        runtime.renderScreen('test-screen');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        
        // Error message should be clear about missing UI provider
        expect(message.toLowerCase()).toMatch(/ui provider|provider/);
        expect(message.toLowerCase()).toMatch(/not|no|missing/);
      }
    });
  });

  describe('Plugin setup error includes plugin name', () => {
    it('should include plugin name in setup error message', async () => {
      // Requirement: 16.6
      const runtime = new Runtime();
      const pluginName = 'my-failing-plugin';
      
      const failingPlugin: PluginDefinition = {
        name: pluginName,
        version: '1.0.0',
        setup: () => {
          throw new Error('Something went wrong during setup');
        }
      };
      
      runtime.registerPlugin(failingPlugin);
      
      try {
        await runtime.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        
        // Error message should include plugin name
        expect(message).toContain(pluginName);
        expect(message).toContain('my-failing-plugin');
        
        // Error message should indicate it's a setup failure
        expect(message.toLowerCase()).toContain('setup');
      }
    });

    it('should include plugin name even with async setup failure', async () => {
      // Requirement: 16.6
      const runtime = new Runtime();
      const pluginName = 'async-failing-plugin';
      
      const failingPlugin: PluginDefinition = {
        name: pluginName,
        version: '1.0.0',
        setup: async () => {
          await Promise.resolve();
          throw new Error('Async setup error');
        }
      };
      
      runtime.registerPlugin(failingPlugin);
      
      try {
        await runtime.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(pluginName);
        expect((error as Error).message).toContain('async-failing-plugin');
      }
    });
  });

  describe('Plugin dispose error logging', () => {
    it('should log dispose errors with plugin name', async () => {
      // Requirement: 16.7
      const runtime = new Runtime();
      const pluginName = 'dispose-failing-plugin';
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const plugin: PluginDefinition = {
        name: pluginName,
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          throw new Error('Dispose failed');
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();
      
      // Verify console.error was called with plugin name
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      const errorCalls = consoleErrorSpy.mock.calls;
      const relevantCall = errorCalls.find(call => 
        call.some(arg => typeof arg === 'string' && arg.includes(pluginName))
      );
      
      expect(relevantCall).toBeDefined();
      
      const errorMessage = relevantCall![0] as string;
      expect(errorMessage).toContain(pluginName);
      expect(errorMessage).toContain('dispose-failing-plugin');
      
      consoleErrorSpy.mockRestore();
    });

    it('should continue cleanup after dispose error', async () => {
      // Requirement: 16.7
      const runtime = new Runtime();
      let plugin2DisposeCalled = false;
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          throw new Error('Plugin 1 dispose failed');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          plugin2DisposeCalled = true;
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      await runtime.shutdown();
      
      // Plugin 2 dispose should still be called despite plugin 1 error
      expect(plugin2DisposeCalled).toBe(true);
      
      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});
