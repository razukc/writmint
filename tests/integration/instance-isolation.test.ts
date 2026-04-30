import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, ScreenDefinition, ActionDefinition } from '../../src/types.js';

describe('Runtime instance isolation integration tests', () => {
  let runtime1: Runtime;
  let runtime2: Runtime;

  beforeEach(() => {
    runtime1 = new Runtime();
    runtime2 = new Runtime();
  });

  describe('Multiple Runtime instances have separate registries', () => {
    it('should maintain separate plugin registries across instances', async () => {
      // Requirements: 1.1, 1.2, 1.5
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {}
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {}
      };

      // Register different plugins in each runtime
      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Each runtime should only have its own plugin
      expect(context1.plugins.getPlugin('plugin1')).not.toBeNull();
      expect(context1.plugins.getPlugin('plugin2')).toBeNull();
      expect(context1.plugins.getAllPlugins()).toHaveLength(1);

      expect(context2.plugins.getPlugin('plugin2')).not.toBeNull();
      expect(context2.plugins.getPlugin('plugin1')).toBeNull();
      expect(context2.plugins.getAllPlugins()).toHaveLength(1);
    });

    it('should maintain separate screen registries across instances', async () => {
      // Requirements: 1.1, 1.2
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Register different screens in each runtime
      context1.screens.registerScreen({
        id: 'screen1',
        title: 'Screen 1',
        component: 'Component1'
      });

      context2.screens.registerScreen({
        id: 'screen2',
        title: 'Screen 2',
        component: 'Component2'
      });

      // Each runtime should only have its own screen
      expect(context1.screens.getScreen('screen1')).not.toBeNull();
      expect(context1.screens.getScreen('screen2')).toBeNull();
      expect(context1.screens.getAllScreens()).toHaveLength(1);

      expect(context2.screens.getScreen('screen2')).not.toBeNull();
      expect(context2.screens.getScreen('screen1')).toBeNull();
      expect(context2.screens.getAllScreens()).toHaveLength(1);
    });

    it('should maintain separate action registries across instances', async () => {
      // Requirements: 1.1, 1.2
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Register different actions in each runtime
      context1.actions.registerAction({
        id: 'action1',
        handler: async () => 'result1'
      });

      context2.actions.registerAction({
        id: 'action2',
        handler: async () => 'result2'
      });

      // Each runtime should only execute its own actions
      expect(await context1.actions.runAction('action1')).toBe('result1');
      await expect(context1.actions.runAction('action2')).rejects.toThrow();

      expect(await context2.actions.runAction('action2')).toBe('result2');
      await expect(context2.actions.runAction('action1')).rejects.toThrow();
    });

    it('should maintain separate event bus across instances', async () => {
      // Requirements: 1.1, 1.2
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      let event1Fired = false;
      let event2Fired = false;

      // Register event handlers in each runtime
      context1.events.on('test-event', () => {
        event1Fired = true;
      });

      context2.events.on('test-event', () => {
        event2Fired = true;
      });

      // Emit event in runtime1
      context1.events.emit('test-event');

      // Only runtime1 handler should fire
      expect(event1Fired).toBe(true);
      expect(event2Fired).toBe(false);

      // Reset and emit in runtime2
      event1Fired = false;
      event2Fired = false;

      context2.events.emit('test-event');

      // Only runtime2 handler should fire
      expect(event1Fired).toBe(false);
      expect(event2Fired).toBe(true);
    });

    it('should maintain separate UI provider across instances', async () => {
      // Requirements: 1.1, 1.2
      await runtime1.initialize();
      await runtime2.initialize();

      const provider1 = {
        mount: () => {},
        renderScreen: () => 'provider1'
      };

      const provider2 = {
        mount: () => {},
        renderScreen: () => 'provider2'
      };

      // Set different providers in each runtime
      runtime1.setUIProvider(provider1);
      runtime2.setUIProvider(provider2);

      // Each runtime should have its own provider
      expect(runtime1.getUIProvider()).toBe(provider1);
      expect(runtime2.getUIProvider()).toBe(provider2);
    });
  });

  describe('Plugin registration in one instance does not affect another', () => {
    it('should not share plugin registrations between instances', async () => {
      // Requirements: 1.5
      const plugin1: PluginDefinition = {
        name: 'shared-name',
        version: '1.0.0',
        setup: () => {}
      };

      const plugin2: PluginDefinition = {
        name: 'shared-name',
        version: '2.0.0',
        setup: () => {}
      };

      // Register plugin with same name in both runtimes
      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Each runtime should have its own version
      const retrievedPlugin1 = context1.plugins.getPlugin('shared-name');
      const retrievedPlugin2 = context2.plugins.getPlugin('shared-name');

      expect(retrievedPlugin1).not.toBeNull();
      expect(retrievedPlugin2).not.toBeNull();
      expect(retrievedPlugin1?.version).toBe('1.0.0');
      expect(retrievedPlugin2?.version).toBe('2.0.0');
    });

    it('should allow same plugin to be registered in multiple instances', async () => {
      // Requirements: 1.5
      let setupCount = 0;

      const sharedPlugin: PluginDefinition = {
        name: 'shared-plugin',
        version: '1.0.0',
        setup: () => {
          setupCount++;
        }
      };

      // Register same plugin in both runtimes
      runtime1.registerPlugin(sharedPlugin);
      runtime2.registerPlugin(sharedPlugin);

      await runtime1.initialize();
      await runtime2.initialize();

      // Setup should be called twice (once per instance)
      expect(setupCount).toBe(2);

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Both should have the plugin
      expect(context1.plugins.getPlugin('shared-plugin')).not.toBeNull();
      expect(context2.plugins.getPlugin('shared-plugin')).not.toBeNull();
    });

    it('should execute plugin setup independently in each instance', async () => {
      // Requirements: 1.5
      const executionOrder: string[] = [];

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          const runtime = ctx.getRuntime();
          if (runtime === runtime1) {
            executionOrder.push('runtime1');
          } else if (runtime === runtime2) {
            executionOrder.push('runtime2');
          }
        }
      };

      runtime1.registerPlugin(plugin);
      runtime2.registerPlugin(plugin);

      await runtime1.initialize();
      await runtime2.initialize();

      // Both runtimes should have executed setup
      expect(executionOrder).toHaveLength(2);
      expect(executionOrder).toContain('runtime1');
      expect(executionOrder).toContain('runtime2');
    });
  });

  describe('Screen registration in one instance does not affect another', () => {
    it('should not share screen registrations between instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      const screen: ScreenDefinition = {
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      };

      // Register screen only in runtime1
      context1.screens.registerScreen(screen);

      // Runtime1 should have the screen
      expect(context1.screens.getScreen('test-screen')).not.toBeNull();
      expect(context1.screens.getAllScreens()).toHaveLength(1);

      // Runtime2 should not have the screen
      expect(context2.screens.getScreen('test-screen')).toBeNull();
      expect(context2.screens.getAllScreens()).toHaveLength(0);
    });

    it('should allow duplicate screen IDs across different instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      const screen1: ScreenDefinition = {
        id: 'duplicate-id',
        title: 'Screen in Runtime 1',
        component: 'Component1'
      };

      const screen2: ScreenDefinition = {
        id: 'duplicate-id',
        title: 'Screen in Runtime 2',
        component: 'Component2'
      };

      // Register screens with same ID in different runtimes
      context1.screens.registerScreen(screen1);
      context2.screens.registerScreen(screen2);

      // Each runtime should have its own screen
      const retrieved1 = context1.screens.getScreen('duplicate-id');
      const retrieved2 = context2.screens.getScreen('duplicate-id');

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      expect(retrieved1?.title).toBe('Screen in Runtime 1');
      expect(retrieved2?.title).toBe('Screen in Runtime 2');
    });

    it('should maintain separate screen counts across instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Register multiple screens in runtime1
      context1.screens.registerScreen({
        id: 'screen1',
        title: 'Screen 1',
        component: 'Component1'
      });
      context1.screens.registerScreen({
        id: 'screen2',
        title: 'Screen 2',
        component: 'Component2'
      });
      context1.screens.registerScreen({
        id: 'screen3',
        title: 'Screen 3',
        component: 'Component3'
      });

      // Register one screen in runtime2
      context2.screens.registerScreen({
        id: 'screen-a',
        title: 'Screen A',
        component: 'ComponentA'
      });

      // Each runtime should have its own count
      expect(context1.screens.getAllScreens()).toHaveLength(3);
      expect(context2.screens.getAllScreens()).toHaveLength(1);
    });
  });

  describe('Action registration in one instance does not affect another', () => {
    it('should not share action registrations between instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      const action: ActionDefinition = {
        id: 'test-action',
        handler: async () => 'result'
      };

      // Register action only in runtime1
      context1.actions.registerAction(action);

      // Runtime1 should be able to run the action
      expect(await context1.actions.runAction('test-action')).toBe('result');

      // Runtime2 should not have the action
      await expect(context2.actions.runAction('test-action')).rejects.toThrow();
    });

    it('should allow duplicate action IDs across different instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      const action1: ActionDefinition = {
        id: 'duplicate-action',
        handler: async () => 'result-from-runtime1'
      };

      const action2: ActionDefinition = {
        id: 'duplicate-action',
        handler: async () => 'result-from-runtime2'
      };

      // Register actions with same ID in different runtimes
      context1.actions.registerAction(action1);
      context2.actions.registerAction(action2);

      // Each runtime should execute its own action
      expect(await context1.actions.runAction('duplicate-action')).toBe('result-from-runtime1');
      expect(await context2.actions.runAction('duplicate-action')).toBe('result-from-runtime2');
    });

    it('should pass correct RuntimeContext to actions in each instance', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      let receivedRuntime1: any = null;
      let receivedRuntime2: any = null;

      const action1: ActionDefinition = {
        id: 'action1',
        handler: async (params, ctx) => {
          receivedRuntime1 = ctx.getRuntime();
          return 'done';
        }
      };

      const action2: ActionDefinition = {
        id: 'action2',
        handler: async (params, ctx) => {
          receivedRuntime2 = ctx.getRuntime();
          return 'done';
        }
      };

      context1.actions.registerAction(action1);
      context2.actions.registerAction(action2);

      await context1.actions.runAction('action1');
      await context2.actions.runAction('action2');

      // Each action should receive its own runtime instance
      expect(receivedRuntime1).toBe(runtime1);
      expect(receivedRuntime2).toBe(runtime2);
      expect(receivedRuntime1).not.toBe(receivedRuntime2);
    });
  });

  describe('Event emission in one instance does not affect another', () => {
    it('should not share event handlers between instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      let handler1Called = false;
      let handler2Called = false;

      // Register handlers in each runtime
      context1.events.on('shared-event', () => {
        handler1Called = true;
      });

      context2.events.on('shared-event', () => {
        handler2Called = true;
      });

      // Emit in runtime1
      context1.events.emit('shared-event');

      // Only handler1 should be called
      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(false);

      // Reset and emit in runtime2
      handler1Called = false;
      handler2Called = false;

      context2.events.emit('shared-event');

      // Only handler2 should be called
      expect(handler1Called).toBe(false);
      expect(handler2Called).toBe(true);
    });

    it('should maintain separate event subscriptions across instances', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      let count1 = 0;
      let count2 = 0;

      // Register multiple handlers in runtime1
      context1.events.on('test-event', () => { count1++; });
      context1.events.on('test-event', () => { count1++; });
      context1.events.on('test-event', () => { count1++; });

      // Register one handler in runtime2
      context2.events.on('test-event', () => { count2++; });

      // Emit in runtime1
      context1.events.emit('test-event');
      expect(count1).toBe(3);
      expect(count2).toBe(0);

      // Emit in runtime2
      context2.events.emit('test-event');
      expect(count1).toBe(3);
      expect(count2).toBe(1);
    });

    it('should allow unsubscribe in one instance without affecting another', async () => {
      // Requirements: 1.4
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      let handler1Called = false;
      let handler2Called = false;

      // Register handlers and get unsubscribe functions
      const unsubscribe1 = context1.events.on('test-event', () => {
        handler1Called = true;
      });

      const unsubscribe2 = context2.events.on('test-event', () => {
        handler2Called = true;
      });

      // Unsubscribe in runtime1
      unsubscribe1();

      // Emit in both runtimes
      context1.events.emit('test-event');
      context2.events.emit('test-event');

      // Handler1 should not be called, handler2 should be called
      expect(handler1Called).toBe(false);
      expect(handler2Called).toBe(true);
    });
  });

  describe('Complex cross-instance scenarios', () => {
    it('should maintain isolation when plugins register resources', async () => {
      // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'plugin1-screen',
            title: 'Plugin 1 Screen',
            component: 'Component1'
          });
          ctx.actions.registerAction({
            id: 'plugin1-action',
            handler: async () => 'plugin1-result'
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'plugin2-screen',
            title: 'Plugin 2 Screen',
            component: 'Component2'
          });
          ctx.actions.registerAction({
            id: 'plugin2-action',
            handler: async () => 'plugin2-result'
          });
        }
      };

      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Runtime1 should only have plugin1's resources
      expect(context1.screens.getScreen('plugin1-screen')).not.toBeNull();
      expect(context1.screens.getScreen('plugin2-screen')).toBeNull();
      expect(await context1.actions.runAction('plugin1-action')).toBe('plugin1-result');
      await expect(context1.actions.runAction('plugin2-action')).rejects.toThrow();

      // Runtime2 should only have plugin2's resources
      expect(context2.screens.getScreen('plugin2-screen')).not.toBeNull();
      expect(context2.screens.getScreen('plugin1-screen')).toBeNull();
      expect(await context2.actions.runAction('plugin2-action')).toBe('plugin2-result');
      await expect(context2.actions.runAction('plugin1-action')).rejects.toThrow();
    });

    it('should maintain isolation after shutdown of one instance', async () => {
      // Requirements: 1.1, 1.2, 1.3
      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Register resources in both runtimes
      context1.screens.registerScreen({
        id: 'screen1',
        title: 'Screen 1',
        component: 'Component1'
      });

      context2.screens.registerScreen({
        id: 'screen2',
        title: 'Screen 2',
        component: 'Component2'
      });

      // Shutdown runtime1
      await runtime1.shutdown();

      // Runtime1 should be shut down
      expect(() => runtime1.getContext()).toThrow('Runtime not initialized');

      // Runtime2 should still be functional
      expect(context2.screens.getScreen('screen2')).not.toBeNull();
      expect(context2.screens.getAllScreens()).toHaveLength(1);
    });

    it('should allow creating many runtime instances', async () => {
      // Requirements: 1.1, 1.2, 1.3, 1.4
      const runtimes: Runtime[] = [];
      const count = 5;

      // Create multiple runtime instances
      for (let i = 0; i < count; i++) {
        const runtime = new Runtime();
        await runtime.initialize();
        
        const context = runtime.getContext();
        context.screens.registerScreen({
          id: `screen-${i}`,
          title: `Screen ${i}`,
          component: `Component${i}`
        });
        
        runtimes.push(runtime);
      }

      // Verify each runtime has only its own screen
      for (let i = 0; i < count; i++) {
        const context = runtimes[i].getContext();
        
        // Should have its own screen
        expect(context.screens.getScreen(`screen-${i}`)).not.toBeNull();
        expect(context.screens.getAllScreens()).toHaveLength(1);
        
        // Should not have other screens
        for (let j = 0; j < count; j++) {
          if (i !== j) {
            expect(context.screens.getScreen(`screen-${j}`)).toBeNull();
          }
        }
      }
    });

    it('should not share global state between instances', async () => {
      // Requirements: 1.2, 1.3
      let globalCounter = 0;

      const plugin: PluginDefinition = {
        name: 'counter-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          // This plugin increments a global counter
          globalCounter++;
          
          // Register an action that uses the counter
          ctx.actions.registerAction({
            id: 'get-counter',
            handler: async () => globalCounter
          });
        }
      };

      runtime1.registerPlugin(plugin);
      runtime2.registerPlugin(plugin);

      await runtime1.initialize();
      await runtime2.initialize();

      // Both plugins should have incremented the global counter
      expect(globalCounter).toBe(2);

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Both actions should return the same global value
      // This demonstrates that while the plugin uses global state,
      // the runtime instances themselves remain isolated
      expect(await context1.actions.runAction('get-counter')).toBe(2);
      expect(await context2.actions.runAction('get-counter')).toBe(2);

      // But the actions are still isolated to their instances
      await expect(context1.actions.runAction('non-existent')).rejects.toThrow();
      await expect(context2.actions.runAction('non-existent')).rejects.toThrow();
    });
  });
});
