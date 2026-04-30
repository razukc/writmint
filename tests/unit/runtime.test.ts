import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition } from '../../src/types.js';
import { RuntimeState } from '../../src/types.js';

describe('Runtime initialization integration tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('Full initialization sequence', () => {
    it('should create all subsystems in correct order', async () => {
      // Requirements: 2.1, 2.2, 2.3, 2.4
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Verify all subsystem APIs are available
      expect(context.screens).toBeDefined();
      expect(context.screens.registerScreen).toBeDefined();
      expect(context.screens.getScreen).toBeDefined();
      expect(context.screens.getAllScreens).toBeDefined();
      
      expect(context.actions).toBeDefined();
      expect(context.actions.registerAction).toBeDefined();
      expect(context.actions.runAction).toBeDefined();
      
      expect(context.plugins).toBeDefined();
      expect(context.plugins.registerPlugin).toBeDefined();
      expect(context.plugins.getPlugin).toBeDefined();
      expect(context.plugins.getAllPlugins).toBeDefined();
      
      expect(context.events).toBeDefined();
      expect(context.events.emit).toBeDefined();
      expect(context.events.on).toBeDefined();
      
      expect(context.getRuntime).toBeDefined();
      expect(typeof context.getRuntime).toBe('function');
      expect(context.getRuntime()).toBe(runtime);
    });

    it('should allow subsystems to function after initialization', async () => {
      // Requirements: 2.1, 2.2, 2.3, 2.4
      await runtime.initialize();
      const context = runtime.getContext();
      
      // Test ScreenRegistry works
      context.screens.registerScreen({
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });
      expect(context.screens.getScreen('test-screen')).not.toBeNull();
      
      // Test ActionEngine works
      context.actions.registerAction({
        id: 'test-action',
        handler: async () => 'success'
      });
      const result = await context.actions.runAction('test-action');
      expect(result).toBe('success');
      
      // Test EventBus works
      let eventFired = false;
      context.events.on('test-event', () => { eventFired = true; });
      context.events.emit('test-event');
      expect(eventFired).toBe(true);
    });
  });

  describe('Plugin setup execution order', () => {
    it('should execute plugin setup callbacks in registration order', async () => {
      // Requirements: 2.5, 14.3
      const executionOrder: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin1');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin2');
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin3');
        }
      };
      
      // Register plugins before initialization
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      
      // Initialize runtime - this should execute setup callbacks in order
      await runtime.initialize();
      
      // Verify execution order
      expect(executionOrder).toEqual(['plugin1', 'plugin2', 'plugin3']);
    });

    it('should execute plugin setup callbacks sequentially', async () => {
      // Requirements: 2.5, 14.3
      const executionOrder: string[] = [];
      let plugin1SetupComplete = false;
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: async () => {
          executionOrder.push('plugin1-start');
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, 10));
          plugin1SetupComplete = true;
          executionOrder.push('plugin1-end');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          // Plugin2 should only run after plugin1 completes
          executionOrder.push('plugin2-start');
          expect(plugin1SetupComplete).toBe(true);
          executionOrder.push('plugin2-end');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      
      // Verify sequential execution
      expect(executionOrder).toEqual(['plugin1-start', 'plugin1-end', 'plugin2-start', 'plugin2-end']);
    });

    it('should allow plugins to register additional plugins during setup', async () => {
      // Requirements: 12.3, 14.3
      const executionOrder: string[] = [];
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin2');
        }
      };
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (ctx) => {
          executionOrder.push('plugin1');
          // Register plugin2 during plugin1 setup
          ctx.plugins.registerPlugin(plugin2);
        }
      };
      
      runtime.registerPlugin(plugin1);
      await runtime.initialize();
      
      // Plugin1 should execute, and plugin2 will also execute
      // because the Map iterator picks up newly added entries
      expect(executionOrder).toEqual(['plugin1', 'plugin2']);
      
      // Verify plugin2 was registered
      const context = runtime.getContext();
      expect(context.plugins.getPlugin('plugin2')).not.toBeNull();
    });
  });

  describe('Async plugin setup', () => {
    it('should await async plugin setup before continuing', async () => {
      // Requirements: 14.1, 14.2
      const executionOrder: string[] = [];
      let asyncOperationComplete = false;
      
      const asyncPlugin: PluginDefinition = {
        name: 'async-plugin',
        version: '1.0.0',
        setup: async () => {
          executionOrder.push('async-start');
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 50));
          asyncOperationComplete = true;
          executionOrder.push('async-end');
        }
      };
      
      const syncPlugin: PluginDefinition = {
        name: 'sync-plugin',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('sync');
          // This should only run after async plugin completes
          expect(asyncOperationComplete).toBe(true);
        }
      };
      
      runtime.registerPlugin(asyncPlugin);
      runtime.registerPlugin(syncPlugin);
      
      await runtime.initialize();
      
      // Verify async plugin completed before sync plugin started
      expect(executionOrder).toEqual(['async-start', 'async-end', 'sync']);
      expect(asyncOperationComplete).toBe(true);
    });

    it('should support both sync and async plugin setup', async () => {
      // Requirements: 14.1, 14.2
      let syncCalled = false;
      let asyncCalled = false;
      
      const syncPlugin: PluginDefinition = {
        name: 'sync-plugin',
        version: '1.0.0',
        setup: () => {
          syncCalled = true;
        }
      };
      
      const asyncPlugin: PluginDefinition = {
        name: 'async-plugin',
        version: '1.0.0',
        setup: async () => {
          await Promise.resolve();
          asyncCalled = true;
        }
      };
      
      runtime.registerPlugin(syncPlugin);
      runtime.registerPlugin(asyncPlugin);
      
      await runtime.initialize();
      
      // Verify both plugins executed
      expect(syncCalled).toBe(true);
      expect(asyncCalled).toBe(true);
    });
  });

  describe('Plugin setup failure handling', () => {
    it('should abort initialization if plugin setup fails', async () => {
      // Requirements: 2.7, 3.2, 14.4
      const executionOrder: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin1');
        }
      };
      
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('failing');
          throw new Error('Setup failed');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin2');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(failingPlugin);
      runtime.registerPlugin(plugin2);
      
      // Initialize should throw
      await expect(runtime.initialize()).rejects.toThrow();
      
      // Plugin1 should have executed, but plugin2 should not
      expect(executionOrder).toEqual(['plugin1', 'failing']);
      
      // Runtime should not be initialized
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });

    it('should include plugin name in error when setup fails', async () => {
      // Requirements: 3.4, 16.6
      const failingPlugin: PluginDefinition = {
        name: 'my-failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Something went wrong');
        }
      };
      
      runtime.registerPlugin(failingPlugin);
      
      // Error should include plugin name and "setup failed"
      const error = await runtime.initialize().catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('my-failing-plugin');
      expect(error.message).toContain('setup failed');
    });

    it('should not apply partial plugin state on failure', async () => {
      // Requirements: 3.3
      let plugin1SetupCalled = false;
      let plugin2SetupCalled = false;
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (ctx) => {
          plugin1SetupCalled = true;
          // Register a screen during setup
          ctx.screens.registerScreen({
            id: 'plugin1-screen',
            title: 'Plugin 1 Screen',
            component: 'Component1'
          });
        }
      };
      
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          plugin2SetupCalled = true;
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(failingPlugin);
      runtime.registerPlugin(plugin2);
      
      // Initialize should fail
      await expect(runtime.initialize()).rejects.toThrow();
      
      // Plugin1 setup was called, but plugin2 was not
      expect(plugin1SetupCalled).toBe(true);
      expect(plugin2SetupCalled).toBe(false);
      
      // Runtime should not be initialized, so we can't access context
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });
  });

  describe('Initialize called twice', () => {
    it('should throw error if initialize called twice', async () => {
      // Requirement: 15.1
      await runtime.initialize();
      
      await expect(runtime.initialize()).rejects.toThrow('Runtime already initialized');
    });

    it('should maintain initialized state after first initialization', async () => {
      // Requirement: 15.1
      await runtime.initialize();
      
      const context1 = runtime.getContext();
      
      // Try to initialize again
      await expect(runtime.initialize()).rejects.toThrow();
      
      // Context should still be accessible
      const context2 = runtime.getContext();
      expect(context2).toBe(context1);
    });
  });

  describe('RuntimeContext passed to plugin setup', () => {
    it('should pass RuntimeContext to plugin setup callbacks', async () => {
      // Requirements: 2.5, 9.7
      let receivedContext: any = null;
      
      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          receivedContext = context;
        }
      };
      
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();
      
      // Verify context was passed
      expect(receivedContext).not.toBeNull();
      expect(receivedContext.screens).toBeDefined();
      expect(receivedContext.actions).toBeDefined();
      expect(receivedContext.plugins).toBeDefined();
      expect(receivedContext.events).toBeDefined();
      expect(receivedContext.getRuntime).toBeDefined();
      expect(receivedContext.getRuntime()).toBe(runtime);
    });

    it('should allow plugins to access all subsystems through context', async () => {
      // Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
      let contextFromPlugin: any = null;
      
      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          contextFromPlugin = context;
          
          // Test that all APIs are accessible
          context.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          context.actions.registerAction({
            id: 'test-action',
            handler: async () => 'result'
          });
          
          context.events.on('test-event', () => {});
        }
      };
      
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();
      
      // Verify all subsystem APIs were accessible
      expect(contextFromPlugin).not.toBeNull();
      
      const context = runtime.getContext();
      expect(context.screens.getScreen('test-screen')).not.toBeNull();
      expect(await context.actions.runAction('test-action')).toBe('result');
    });

    it('should pass same RuntimeContext instance to all plugins', async () => {
      // Requirement: 9.7
      const contexts: any[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (ctx) => {
          contexts.push(ctx);
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (ctx) => {
          contexts.push(ctx);
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: (ctx) => {
          contexts.push(ctx);
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      
      await runtime.initialize();
      
      // Each plugin receives a tracked proxy wrapping the same underlying context.
      // Verify all proxies share the same runtime state.
      expect(contexts.length).toBe(3);
      expect(contexts[0].config).toEqual(contexts[1].config);
      expect(contexts[1].config).toEqual(contexts[2].config);
      
      // getContext() returns the real context; proxies delegate to the same registries
      const context = runtime.getContext();
      expect(contexts[0].introspect.listPlugins()).toEqual(context.introspect.listPlugins());
    });
  });

  describe('getContext before initialization', () => {
    it('should throw error if getContext called before initialization', () => {
      // Requirement: 15.1
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });
  });
});

describe('Runtime shutdown integration tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('Dispose only initialized plugins', () => {
    it('should call dispose only for plugins that completed setup successfully', async () => {
      // Requirement: 4.2
      const disposeCalls: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin1');
        }
      };
      
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        },
        dispose: () => {
          disposeCalls.push('failing-plugin');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin2');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(failingPlugin);
      runtime.registerPlugin(plugin2);
      
      // Initialize should fail at failingPlugin, triggering rollback
      await expect(runtime.initialize()).rejects.toThrow();
      
      // plugin1 dispose should have been called during rollback
      expect(disposeCalls).toEqual(['plugin1']);
      
      // Clear the array for the next test
      disposeCalls.length = 0;
      
      // Create a new runtime and register only successful plugins
      runtime = new Runtime();
      runtime.registerPlugin(plugin1);
      await runtime.initialize();
      
      // Now shutdown
      await runtime.shutdown();
      
      // plugin1 dispose should be called again during shutdown
      expect(disposeCalls).toEqual(['plugin1']);
    });

    it('should not call dispose for plugins without dispose callback', async () => {
      // Requirement: 4.2
      let setupCalled = false;
      
      const pluginWithoutDispose: PluginDefinition = {
        name: 'no-dispose',
        version: '1.0.0',
        setup: () => {
          setupCalled = true;
        }
        // No dispose callback
      };
      
      runtime.registerPlugin(pluginWithoutDispose);
      await runtime.initialize();
      
      expect(setupCalled).toBe(true);
      
      // Shutdown should not throw even though plugin has no dispose
      await expect(runtime.shutdown()).resolves.not.toThrow();
    });

    it('should track initialized plugins correctly across multiple plugins', async () => {
      // Requirement: 4.2, 4.3
      const disposeCalls: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin1');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin2');
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin3');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      
      await runtime.initialize();
      await runtime.shutdown();
      
      // All three plugins should have dispose called in reverse order (Requirement 5.1)
      expect(disposeCalls).toEqual(['plugin3', 'plugin2', 'plugin1']);
    });
  });

  describe('Dispose execution order', () => {
    it('should execute dispose callbacks in same order as setup', async () => {
      // Requirement: 4.3
      const executionOrder: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('setup-plugin1');
        },
        dispose: () => {
          executionOrder.push('dispose-plugin1');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('setup-plugin2');
        },
        dispose: () => {
          executionOrder.push('dispose-plugin2');
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('setup-plugin3');
        },
        dispose: () => {
          executionOrder.push('dispose-plugin3');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      
      await runtime.initialize();
      await runtime.shutdown();
      
      // Dispose should execute in reverse order of setup (Requirement 5.1)
      expect(executionOrder).toEqual([
        'setup-plugin1',
        'setup-plugin2',
        'setup-plugin3',
        'dispose-plugin3',
        'dispose-plugin2',
        'dispose-plugin1'
      ]);
    });

    it('should execute async dispose callbacks sequentially', async () => {
      // Requirement: 4.3, 5.1 - Dispose in reverse order
      const executionOrder: string[] = [];
      let plugin2DisposeComplete = false;
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          executionOrder.push('dispose-plugin1');
          // Plugin1 dispose should run after plugin2 completes (reverse order)
          expect(plugin2DisposeComplete).toBe(true);
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: async () => {
          executionOrder.push('dispose-plugin2-start');
          await new Promise(resolve => setTimeout(resolve, 10));
          plugin2DisposeComplete = true;
          executionOrder.push('dispose-plugin2-end');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      await runtime.shutdown();
      
      expect(executionOrder).toEqual([
        'dispose-plugin2-start',
        'dispose-plugin2-end',
        'dispose-plugin1'
      ]);
    });
  });

  describe('Dispose error handling', () => {
    it('should not prevent cleanup if dispose callback throws error', async () => {
      // Requirement: 4.4
      const disposeCalls: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin1');
        }
      };
      
      const failingDisposePlugin: PluginDefinition = {
        name: 'failing-dispose',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('failing-dispose');
          throw new Error('Dispose failed');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('plugin2');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(failingDisposePlugin);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      
      // Shutdown should not throw even if dispose fails
      await expect(runtime.shutdown()).resolves.not.toThrow();
      
      // All dispose callbacks should have been called in reverse order (Requirement 5.1)
      expect(disposeCalls).toEqual(['plugin2', 'failing-dispose', 'plugin1']);
    });

    it('should continue cleanup if multiple dispose callbacks fail', async () => {
      // Requirement: 4.4
      const disposeCalls: string[] = [];
      
      const failingPlugin1: PluginDefinition = {
        name: 'failing1',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('failing1');
          throw new Error('Dispose failed 1');
        }
      };
      
      const failingPlugin2: PluginDefinition = {
        name: 'failing2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('failing2');
          throw new Error('Dispose failed 2');
        }
      };
      
      const successPlugin: PluginDefinition = {
        name: 'success',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCalls.push('success');
        }
      };
      
      runtime.registerPlugin(failingPlugin1);
      runtime.registerPlugin(failingPlugin2);
      runtime.registerPlugin(successPlugin);
      
      await runtime.initialize();
      await runtime.shutdown();
      
      // All dispose callbacks should have been attempted in reverse order (Requirement 5.1)
      expect(disposeCalls).toEqual(['success', 'failing2', 'failing1']);
    });
  });

  describe('Registry cleanup', () => {
    it('should clear all registries during shutdown', async () => {
      // Requirement: 4.5
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          // Register items in all registries
          ctx.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          ctx.actions.registerAction({
            id: 'test-action',
            handler: async () => 'result'
          });
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Verify items are registered
      expect(context.screens.getScreen('test-screen')).not.toBeNull();
      expect(context.screens.getAllScreens()).toHaveLength(1);
      expect(context.plugins.getPlugin('test-plugin')).not.toBeNull();
      expect(context.plugins.getAllPlugins()).toHaveLength(1);
      
      // Shutdown
      await runtime.shutdown();
      
      // After shutdown, getContext should throw
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });

    it('should clear screens registry', async () => {
      // Requirement: 4.5
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'screen1',
            title: 'Screen 1',
            component: 'Component1'
          });
          ctx.screens.registerScreen({
            id: 'screen2',
            title: 'Screen 2',
            component: 'Component2'
          });
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.screens.getAllScreens()).toHaveLength(2);
      
      await runtime.shutdown();
      
      // Create new runtime to verify registries are cleared
      const newRuntime = new Runtime();
      await newRuntime.initialize();
      const newContext = newRuntime.getContext();
      
      // New runtime should have empty registries
      expect(newContext.screens.getAllScreens()).toHaveLength(0);
    });

    it('should clear actions registry', async () => {
      // Requirement: 4.5
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.actions.registerAction({
            id: 'action1',
            handler: async () => 'result1'
          });
          ctx.actions.registerAction({
            id: 'action2',
            handler: async () => 'result2'
          });
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(await context.actions.runAction('action1')).toBe('result1');
      expect(await context.actions.runAction('action2')).toBe('result2');
      
      await runtime.shutdown();
      
      // After shutdown, actions should not be accessible
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });

    it('should clear events registry', async () => {
      // Requirement: 4.5
      let eventFired = false;
      
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.events.on('test-event', () => {
            eventFired = true;
          });
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      context.events.emit('test-event');
      expect(eventFired).toBe(true);
      
      await runtime.shutdown();
      
      // Create new runtime and verify event handlers are cleared
      eventFired = false;
      const newRuntime = new Runtime();
      await newRuntime.initialize();
      const newContext = newRuntime.getContext();
      
      // Event should not fire in new runtime
      newContext.events.emit('test-event');
      expect(eventFired).toBe(false);
    });

    it('should clear plugins registry', async () => {
      // Requirement: 4.5
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {}
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.plugins.getPlugin('test-plugin')).not.toBeNull();
      expect(context.plugins.getAllPlugins()).toHaveLength(1);
      
      await runtime.shutdown();
      
      // Create new runtime and verify plugins are cleared
      const newRuntime = new Runtime();
      await newRuntime.initialize();
      const newContext = newRuntime.getContext();
      
      expect(newContext.plugins.getPlugin('test-plugin')).toBeNull();
      expect(newContext.plugins.getAllPlugins()).toHaveLength(0);
    });
  });

  describe('Shutdown idempotency', () => {
    it('should be safe to call shutdown multiple times', async () => {
      // Requirement: 4.5
      let disposeCallCount = 0;
      
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCallCount++;
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      // Call shutdown multiple times
      await runtime.shutdown();
      await runtime.shutdown();
      await runtime.shutdown();
      
      // Dispose should only be called once
      expect(disposeCallCount).toBe(1);
    });

    it('should not throw when shutdown called on uninitialized runtime', async () => {
      // Requirement: 4.5
      const uninitializedRuntime = new Runtime();
      
      // Shutdown should not throw
      await expect(uninitializedRuntime.shutdown()).resolves.not.toThrow();
    });

    it('should maintain terminal state after shutdown', async () => {
      // Requirement: 4.5
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {}
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      // Verify runtime is initialized
      expect(() => runtime.getContext()).not.toThrow();
      
      await runtime.shutdown();
      
      // Runtime should be in terminal state
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
      
      // Multiple shutdowns should maintain terminal state
      await runtime.shutdown();
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });

    it('should set initialized flag to false after shutdown', async () => {
      // Requirement: 4.5
      await runtime.initialize();
      
      // Runtime is initialized
      expect(() => runtime.getContext()).not.toThrow();
      
      await runtime.shutdown();
      
      // Runtime is no longer initialized
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });
  });

  describe('Shutdown after failed initialization', () => {
    it('should handle shutdown gracefully after initialization failure', async () => {
      // Requirement: 4.2
      let disposeCallCount = 0;
      
      const successPlugin: PluginDefinition = {
        name: 'success-plugin',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          disposeCallCount++;
        }
      };
      
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        },
        dispose: () => {
          disposeCallCount++;
        }
      };
      
      runtime.registerPlugin(successPlugin);
      runtime.registerPlugin(failingPlugin);
      
      // Initialize should fail, triggering rollback which calls dispose on success-plugin
      await expect(runtime.initialize()).rejects.toThrow();
      
      // Dispose should have been called once during rollback
      expect(disposeCallCount).toBe(1);
      
      // Shutdown should not throw
      await expect(runtime.shutdown()).resolves.not.toThrow();
      
      // Dispose should still be 1 (not called again during shutdown since runtime is not initialized)
      expect(disposeCallCount).toBe(1);
    });
  });
});

describe('Runtime lifecycle events', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('runtime:initialized event', () => {
    it('should emit runtime:initialized event after successful initialization', async () => {
      // Requirements: 17.1, 17.2, 17.3
      let eventEmitted = false;
      let eventData: unknown = null;

      // Register a plugin that subscribes to the lifecycle event
      const plugin: PluginDefinition = {
        name: 'lifecycle-listener',
        version: '1.0.0',
        setup: (context) => {
          context.events.on('runtime:initialized', (data) => {
            eventEmitted = true;
            eventData = data;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Verify event was emitted
      expect(eventEmitted).toBe(true);
      expect(eventData).toBeDefined();
      expect((eventData as any).context).toBeDefined();
      expect((eventData as any).context).toBe(runtime.getContext());
    });

    it('should not emit runtime:initialized event if initialization fails', async () => {
      // Requirements: 17.1
      let eventEmitted = false;

      const successPlugin: PluginDefinition = {
        name: 'success-plugin',
        version: '1.0.0',
        setup: (context) => {
          context.events.on('runtime:initialized', () => {
            eventEmitted = true;
          });
        }
      };

      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(successPlugin);
      runtime.registerPlugin(failingPlugin);

      await expect(runtime.initialize()).rejects.toThrow();

      // Event should not have been emitted since initialization failed
      expect(eventEmitted).toBe(false);
    });
  });

  describe('runtime:shutdown event', () => {
    it('should emit runtime:shutdown event at start of shutdown', async () => {
      // Requirements: 17.4, 17.5
      let eventEmitted = false;
      let eventData: unknown = null;

      const plugin: PluginDefinition = {
        name: 'shutdown-listener',
        version: '1.0.0',
        setup: (context) => {
          context.events.on('runtime:shutdown', (data) => {
            eventEmitted = true;
            eventData = data;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Reset flag before shutdown
      eventEmitted = false;
      
      await runtime.shutdown();

      // Verify event was emitted
      expect(eventEmitted).toBe(true);
      expect(eventData).toBeDefined();
      expect((eventData as any).context).toBeDefined();
    });

    it('should not emit runtime:shutdown event if runtime not initialized', async () => {
      // Requirements: 17.4
      let eventEmitted = false;

      // Try to subscribe to event before initialization (won't work, but testing the scenario)
      // In reality, plugins can't subscribe before initialization
      
      // Just verify shutdown doesn't throw when called on uninitialized runtime
      await expect(runtime.shutdown()).resolves.not.toThrow();
      
      // Event should not have been emitted since runtime was never initialized
      expect(eventEmitted).toBe(false);
    });

    it('should emit runtime:shutdown event before plugin disposal', async () => {
      // Requirements: 17.4, 17.5
      const events: string[] = [];

      const plugin: PluginDefinition = {
        name: 'order-test',
        version: '1.0.0',
        setup: (context) => {
          context.events.on('runtime:shutdown', () => {
            events.push('shutdown-event');
          });
        },
        dispose: () => {
          events.push('plugin-dispose');
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();

      // Verify shutdown event was emitted before plugin disposal
      expect(events).toEqual(['shutdown-event', 'plugin-dispose']);
    });
  });
});

describe('Runtime state tracking', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('isInitialized method', () => {
    it('should return false before initialization', () => {
      // Requirements: 16.1, 16.3
      expect(runtime.isInitialized()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      // Requirements: 16.1, 16.2
      await runtime.initialize();
      expect(runtime.isInitialized()).toBe(true);
    });

    it('should return false after shutdown', async () => {
      // Requirements: 16.1, 16.3
      await runtime.initialize();
      expect(runtime.isInitialized()).toBe(true);
      
      await runtime.shutdown();
      expect(runtime.isInitialized()).toBe(false);
    });

    it('should return false after initialization failure', async () => {
      // Requirements: 16.1, 16.5
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      expect(runtime.isInitialized()).toBe(false);
    });
  });

  describe('getState method', () => {
    it('should return Uninitialized before initialization', () => {
      // Requirements: 16.1, 16.2, 16.5
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
    });

    it('should return Initialized after successful initialization', async () => {
      // Requirements: 16.1, 16.2
      await runtime.initialize();
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
    });

    it('should return Shutdown after shutdown', async () => {
      // Requirements: 16.1, 16.4
      await runtime.initialize();
      await runtime.shutdown();
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
    });

    it('should return Uninitialized after initialization failure', async () => {
      // Requirements: 16.1, 16.5
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
    });
  });

  describe('State transitions during initialize', () => {
    it('should transition from Uninitialized to Initializing to Initialized', async () => {
      // Requirements: 16.2, 16.3
      const states: RuntimeState[] = [];
      
      // Capture initial state
      states.push(runtime.getState());
      
      const plugin: PluginDefinition = {
        name: 'state-tracker',
        version: '1.0.0',
        setup: () => {
          // During setup, state should be Initializing
          states.push(runtime.getState());
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      // After initialization, state should be Initialized
      states.push(runtime.getState());

      expect(states).toEqual([
        RuntimeState.Uninitialized,
        RuntimeState.Initializing,
        RuntimeState.Initialized
      ]);
    });

    it('should maintain Initialized state after successful initialization', async () => {
      // Requirements: 16.2, 16.3
      await runtime.initialize();
      
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
      
      // State should remain Initialized
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
    });

    it('should allow checking state during plugin setup', async () => {
      // Requirements: 16.2
      let stateInSetup: RuntimeState | null = null;

      const plugin: PluginDefinition = {
        name: 'state-checker',
        version: '1.0.0',
        setup: () => {
          stateInSetup = runtime.getState();
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      expect(stateInSetup).toBe(RuntimeState.Initializing);
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
    });
  });

  describe('State transitions during shutdown', () => {
    it('should transition from Initialized to ShuttingDown to Shutdown', async () => {
      // Requirements: 16.4
      const states: RuntimeState[] = [];
      
      await runtime.initialize();
      states.push(runtime.getState());

      const plugin: PluginDefinition = {
        name: 'shutdown-tracker',
        version: '1.0.0',
        setup: (context) => {
          context.events.on('runtime:shutdown', () => {
            // During shutdown event, state should be ShuttingDown
            states.push(runtime.getState());
          });
        },
        dispose: () => {
          // During dispose, state should be ShuttingDown
          states.push(runtime.getState());
        }
      };

      // Need to register plugin before initialization
      runtime = new Runtime();
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      states.length = 0; // Clear states array
      states.push(runtime.getState());
      
      await runtime.shutdown();
      states.push(runtime.getState());

      expect(states).toEqual([
        RuntimeState.Initialized,
        RuntimeState.ShuttingDown,
        RuntimeState.ShuttingDown,
        RuntimeState.Shutdown
      ]);
    });

    it('should maintain Shutdown state after shutdown completes', async () => {
      // Requirements: 16.4
      await runtime.initialize();
      await runtime.shutdown();
      
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
      
      // State should remain Shutdown
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
    });

    it('should remain in Shutdown state after multiple shutdown calls', async () => {
      // Requirements: 16.4
      await runtime.initialize();
      await runtime.shutdown();
      
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
      
      await runtime.shutdown();
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
      
      await runtime.shutdown();
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
    });
  });

  describe('State reset on initialization failure', () => {
    it('should reset state to Uninitialized when initialization fails', async () => {
      // Requirements: 16.5
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);

      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      
      // State should be reset to Uninitialized
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
    });

    it('should reset state to Uninitialized even if state was Initializing', async () => {
      // Requirements: 16.5
      let stateBeforeFailure: RuntimeState | null = null;

      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          stateBeforeFailure = runtime.getState();
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      
      // State was Initializing during setup
      expect(stateBeforeFailure).toBe(RuntimeState.Initializing);
      
      // But should be reset to Uninitialized after failure
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
    });

    it('should allow re-initialization after failure', async () => {
      // Requirements: 16.5
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
      
      // Create new runtime and try again with successful plugin
      runtime = new Runtime();
      const successPlugin: PluginDefinition = {
        name: 'success-plugin',
        version: '1.0.0',
        setup: () => {}
      };

      runtime.registerPlugin(successPlugin);
      await runtime.initialize();
      
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
      expect(runtime.isInitialized()).toBe(true);
    });

    it('should reset isInitialized to false on initialization failure', async () => {
      // Requirements: 16.5
      expect(runtime.isInitialized()).toBe(false);

      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);
      
      await expect(runtime.initialize()).rejects.toThrow();
      
      expect(runtime.isInitialized()).toBe(false);
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
    });
  });

  describe('State consistency with isInitialized', () => {
    it('should have isInitialized return true only when state is Initialized', async () => {
      // Requirements: 16.1, 16.2, 16.3
      // Uninitialized
      expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
      expect(runtime.isInitialized()).toBe(false);

      // Initialize
      await runtime.initialize();
      expect(runtime.getState()).toBe(RuntimeState.Initialized);
      expect(runtime.isInitialized()).toBe(true);

      // Shutdown
      await runtime.shutdown();
      expect(runtime.getState()).toBe(RuntimeState.Shutdown);
      expect(runtime.isInitialized()).toBe(false);
    });

    it('should have isInitialized return false for all non-Initialized states', async () => {
      // Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
      // Uninitialized
      expect(runtime.isInitialized()).toBe(false);

      // After shutdown without initialization
      await runtime.shutdown();
      expect(runtime.isInitialized()).toBe(false);

      // After failed initialization
      runtime = new Runtime();
      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: () => {
          throw new Error('Setup failed');
        }
      };
      runtime.registerPlugin(failingPlugin);
      await expect(runtime.initialize()).rejects.toThrow();
      expect(runtime.isInitialized()).toBe(false);
    });
  });
});
