import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * Integration tests for cross-subsystem interactions.
 * Tests Requirements: 12.1, 12.2, 12.3, 12.4, 9.7, 9.8, 9.9
 */
describe('Cross-subsystem integration tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('Plugin registers screen during setup', () => {
    it('should allow plugin to register screen during setup (Requirement 12.1)', async () => {
      const plugin: PluginDefinition = {
        name: 'screen-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register a screen during setup
          context.screens.registerScreen({
            id: 'plugin-screen',
            title: 'Plugin Screen',
            component: 'PluginComponent'
          });
        }
      };

      // Register plugin BEFORE initialization
      runtime.registerPlugin(plugin);
      
      // Initialize runtime - this should execute plugin setup
      await runtime.initialize();
      
      // Verify the screen was registered during setup
      const context = runtime.getContext();
      const screen = context.screens.getScreen('plugin-screen');
      expect(screen).not.toBeNull();
      expect(screen?.id).toBe('plugin-screen');
      expect(screen?.title).toBe('Plugin Screen');
      expect(screen?.component).toBe('PluginComponent');
    });

    it('should allow multiple plugins to register screens during setup', async () => {
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'screen1',
            title: 'Screen 1',
            component: 'Component1'
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'screen2',
            title: 'Screen 2',
            component: 'Component2'
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.screens.getScreen('screen1')).not.toBeNull();
      expect(context.screens.getScreen('screen2')).not.toBeNull();
      expect(context.screens.getAllScreens()).toHaveLength(2);
    });
  });

  describe('Plugin registers action during setup', () => {
    it('should allow plugin to register action during setup (Requirement 12.2)', async () => {
      let actionExecuted = false;

      const plugin: PluginDefinition = {
        name: 'action-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register an action during setup
          context.actions.registerAction({
            id: 'plugin-action',
            handler: async () => {
              actionExecuted = true;
              return 'action-result';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      // Verify the action was registered and can be executed
      const context = runtime.getContext();
      const result = await context.actions.runAction('plugin-action');
      expect(result).toBe('action-result');
      expect(actionExecuted).toBe(true);
    });

    it('should allow multiple plugins to register actions during setup', async () => {
      const results: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'action1',
            handler: async () => {
              results.push('action1');
              return 'result1';
            }
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'action2',
            handler: async () => {
              results.push('action2');
              return 'result2';
            }
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('action1');
      await context.actions.runAction('action2');
      
      expect(results).toEqual(['action1', 'action2']);
    });
  });

  describe('Plugin registers additional plugin during setup', () => {
    it('should allow plugin to register another plugin during setup (Requirement 12.3)', async () => {
      const setupOrder: string[] = [];

      const childPlugin: PluginDefinition = {
        name: 'child-plugin',
        version: '1.0.0',
        setup: () => {
          setupOrder.push('child');
        }
      };

      const parentPlugin: PluginDefinition = {
        name: 'parent-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          setupOrder.push('parent');
          
          // Register another plugin during setup
          context.plugins.registerPlugin(childPlugin);
        }
      };

      runtime.registerPlugin(parentPlugin);
      await runtime.initialize();
      
      // Verify child plugin was registered and executed
      const context = runtime.getContext();
      const registeredChild = context.plugins.getPlugin('child-plugin');
      expect(registeredChild).not.toBeNull();
      expect(registeredChild?.name).toBe('child-plugin');
      
      // Verify both plugins executed (parent first, then child)
      expect(setupOrder).toEqual(['parent', 'child']);
    });

    it('should allow nested plugin registration during setup', async () => {
      const setupOrder: string[] = [];

      const grandchildPlugin: PluginDefinition = {
        name: 'grandchild',
        version: '1.0.0',
        setup: () => {
          setupOrder.push('grandchild');
        }
      };

      const childPlugin: PluginDefinition = {
        name: 'child',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          setupOrder.push('child');
          context.plugins.registerPlugin(grandchildPlugin);
        }
      };

      const parentPlugin: PluginDefinition = {
        name: 'parent',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          setupOrder.push('parent');
          context.plugins.registerPlugin(childPlugin);
        }
      };

      runtime.registerPlugin(parentPlugin);
      await runtime.initialize();
      
      // All three plugins should have executed in order
      expect(setupOrder).toEqual(['parent', 'child', 'grandchild']);
      
      const context = runtime.getContext();
      expect(context.plugins.getPlugin('parent')).not.toBeNull();
      expect(context.plugins.getPlugin('child')).not.toBeNull();
      expect(context.plugins.getPlugin('grandchild')).not.toBeNull();
    });
  });

  describe('Plugin subscribes to events during setup', () => {
    it('should allow plugin to subscribe to events during setup (Requirement 12.4)', async () => {
      const receivedEvents: string[] = [];

      const plugin: PluginDefinition = {
        name: 'event-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Subscribe to events during setup
          context.events.on('test-event', (data: unknown) => {
            receivedEvents.push(data as string);
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      // Emit an event after initialization
      const context = runtime.getContext();
      context.events.emit('test-event', 'event-data');
      
      // Verify the plugin received the event
      expect(receivedEvents).toEqual(['event-data']);
    });

    it('should allow multiple plugins to subscribe to same event', async () => {
      const plugin1Events: string[] = [];
      const plugin2Events: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('shared-event', (data: unknown) => {
            plugin1Events.push(`plugin1-${data}`);
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('shared-event', (data: unknown) => {
            plugin2Events.push(`plugin2-${data}`);
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();
      
      const context = runtime.getContext();
      context.events.emit('shared-event', 'test');
      
      expect(plugin1Events).toEqual(['plugin1-test']);
      expect(plugin2Events).toEqual(['plugin2-test']);
    });
  });

  describe('Action handler receives RuntimeContext', () => {
    it('should pass RuntimeContext to action handlers (Requirement 9.7, 9.9)', async () => {
      let receivedContext: RuntimeContext | null = null;

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'test-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              receivedContext = ctx;
              return 'success';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('test-action');
      
      // Verify context was passed to action handler
      expect(receivedContext).not.toBeNull();
      expect(receivedContext).toBe(context);
    });

    it('should pass same RuntimeContext instance to all action handlers', async () => {
      const contexts: RuntimeContext[] = [];

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'action1',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              contexts.push(ctx);
              return 'result1';
            }
          });
          
          context.actions.registerAction({
            id: 'action2',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              contexts.push(ctx);
              return 'result2';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('action1');
      await context.actions.runAction('action2');
      
      // All action handlers should receive the same context instance
      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toBe(contexts[1]);
      expect(contexts[0]).toBe(context);
    });
  });

  describe('Action handler can access all subsystems', () => {
    it('should allow action handler to access screens subsystem (Requirement 9.8)', async () => {
      let screenFromAction: any = null;

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register a screen
          context.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          // Register an action that accesses screens
          context.actions.registerAction({
            id: 'access-screen',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              screenFromAction = ctx.screens.getScreen('test-screen');
              return screenFromAction;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      const result = await context.actions.runAction('access-screen');
      
      expect(screenFromAction).not.toBeNull();
      expect(screenFromAction.id).toBe('test-screen');
      expect(result).toBe(screenFromAction);
    });

    it('should allow action handler to register new actions (Requirement 9.8)', async () => {
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'register-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              // Action handler registers another action
              ctx.actions.registerAction({
                id: 'dynamic-action',
                handler: async () => 'dynamic-result'
              });
              return 'registered';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('register-action');
      
      // Verify the dynamically registered action works
      const result = await context.actions.runAction('dynamic-action');
      expect(result).toBe('dynamic-result');
    });

    it('should allow action handler to emit events (Requirement 9.8)', async () => {
      const receivedEvents: string[] = [];

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Subscribe to an event
          context.events.on('action-event', (data: unknown) => {
            receivedEvents.push(data as string);
          });
          
          // Register an action that emits events
          context.actions.registerAction({
            id: 'emit-event',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              ctx.events.emit('action-event', params);
              return 'emitted';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('emit-event', 'test-data');
      
      expect(receivedEvents).toEqual(['test-data']);
    });

    it('should allow action handler to access plugins subsystem (Requirement 9.8)', async () => {
      let pluginFromAction: any = null;

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'access-plugin',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              pluginFromAction = ctx.plugins.getPlugin('test-plugin');
              return pluginFromAction;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      const result = await context.actions.runAction('access-plugin');
      
      expect(pluginFromAction).not.toBeNull();
      expect(pluginFromAction.name).toBe('test-plugin');
      expect(result).toBe(pluginFromAction);
    });

    it('should allow action handler to call other actions (Requirement 9.8)', async () => {
      const executionOrder: string[] = [];

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'action-a',
            handler: async () => {
              executionOrder.push('action-a');
              return 'result-a';
            }
          });
          
          context.actions.registerAction({
            id: 'action-b',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              executionOrder.push('action-b-start');
              const result = await ctx.actions.runAction('action-a');
              executionOrder.push('action-b-end');
              return `b-called-a-${result}`;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      const result = await context.actions.runAction('action-b');
      
      expect(result).toBe('b-called-a-result-a');
      expect(executionOrder).toEqual(['action-b-start', 'action-a', 'action-b-end']);
    });

    it('should allow action handler to access runtime instance (Requirement 9.8)', async () => {
      let runtimeFromAction: any = null;

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'access-runtime',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              runtimeFromAction = ctx.getRuntime();
              return 'accessed';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      await context.actions.runAction('access-runtime');
      
      expect(runtimeFromAction).toBe(runtime);
    });
  });

  describe('Complex cross-subsystem scenarios', () => {
    it('should support plugin that uses all subsystems together', async () => {
      const events: string[] = [];
      let actionResult: string | null = null;

      const comprehensivePlugin: PluginDefinition = {
        name: 'comprehensive-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // 1. Register a screen
          context.screens.registerScreen({
            id: 'comprehensive-screen',
            title: 'Comprehensive Screen',
            component: 'ComprehensiveComponent'
          });

          // 2. Register an action that uses all subsystems
          context.actions.registerAction({
            id: 'comprehensive-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              // Access screens
              const screen = ctx.screens.getScreen('comprehensive-screen');
              
              // Emit event
              ctx.events.emit('action-executed', params);
              
              // Access plugins
              const plugin = ctx.plugins.getPlugin('comprehensive-plugin');
              
              actionResult = `processed-${params}-${screen?.id}-${plugin?.name}`;
              return actionResult;
            }
          });

          // 3. Subscribe to events
          context.events.on('action-executed', (data: unknown) => {
            events.push(`received-${data}`);
          });

          events.push('setup-complete');
        }
      };

      runtime.registerPlugin(comprehensivePlugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Execute the comprehensive action
      const result = await context.actions.runAction('comprehensive-action', 'test-data');
      
      expect(result).toBe('processed-test-data-comprehensive-screen-comprehensive-plugin');
      expect(actionResult).toBe('processed-test-data-comprehensive-screen-comprehensive-plugin');
      expect(events).toContain('setup-complete');
      expect(events).toContain('received-test-data');
    });

    it('should support plugin chain with cross-subsystem dependencies', async () => {
      const executionLog: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          executionLog.push('plugin1-setup');
          
          // Plugin1 registers a screen
          context.screens.registerScreen({
            id: 'plugin1-screen',
            title: 'Plugin 1 Screen',
            component: 'Component1'
          });
          
          // Plugin1 registers an action
          context.actions.registerAction({
            id: 'plugin1-action',
            handler: async () => {
              executionLog.push('plugin1-action');
              return 'plugin1-result';
            }
          });
          
          // Plugin1 subscribes to event
          context.events.on('plugin2-ready', () => {
            executionLog.push('plugin1-received-plugin2-ready');
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          executionLog.push('plugin2-setup');
          
          // Plugin2 can see plugin1's screen
          const plugin1Screen = context.screens.getScreen('plugin1-screen');
          if (plugin1Screen) {
            executionLog.push('plugin2-found-plugin1-screen');
          }
          
          // Plugin2 registers action that calls plugin1's action
          context.actions.registerAction({
            id: 'plugin2-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              executionLog.push('plugin2-action-start');
              const result = await ctx.actions.runAction('plugin1-action');
              executionLog.push('plugin2-action-end');
              return `plugin2-called-${result}`;
            }
          });
          
          // Plugin2 emits event
          context.events.emit('plugin2-ready');
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();
      
      const context = runtime.getContext();
      const result = await context.actions.runAction('plugin2-action');
      
      expect(result).toBe('plugin2-called-plugin1-result');
      expect(executionLog).toContain('plugin1-setup');
      expect(executionLog).toContain('plugin2-setup');
      expect(executionLog).toContain('plugin2-found-plugin1-screen');
      expect(executionLog).toContain('plugin1-received-plugin2-ready');
      expect(executionLog).toContain('plugin2-action-start');
      expect(executionLog).toContain('plugin1-action');
      expect(executionLog).toContain('plugin2-action-end');
    });
  });
});
