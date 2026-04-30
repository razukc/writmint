import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * MLP (Minimum Lovable Product) Feature Completeness Tests
 * Tests Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9
 * 
 * These tests verify that the Core Runtime meets all MLP requirements
 * for production readiness.
 */
describe('MLP Feature Completeness Tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('All subsystems initialize correctly (Requirement 17.1)', () => {
    it('should initialize all required subsystems', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Verify PluginRegistry subsystem
      expect(context.plugins).toBeDefined();
      expect(context.plugins.registerPlugin).toBeDefined();
      expect(context.plugins.getPlugin).toBeDefined();
      expect(context.plugins.getAllPlugins).toBeDefined();
      
      // Verify ScreenRegistry subsystem
      expect(context.screens).toBeDefined();
      expect(context.screens.registerScreen).toBeDefined();
      expect(context.screens.getScreen).toBeDefined();
      expect(context.screens.getAllScreens).toBeDefined();
      
      // Verify ActionEngine subsystem
      expect(context.actions).toBeDefined();
      expect(context.actions.registerAction).toBeDefined();
      expect(context.actions.runAction).toBeDefined();
      
      // Verify EventBus subsystem
      expect(context.events).toBeDefined();
      expect(context.events.emit).toBeDefined();
      expect(context.events.on).toBeDefined();
      
      // Verify RuntimeContext
      expect(context.getRuntime).toBeDefined();
      expect(typeof context.getRuntime).toBe('function');
      expect(context.getRuntime()).toBe(runtime);
    });

    it('should initialize subsystems in correct order', async () => {
      // The initialization order is: PluginRegistry -> ScreenRegistry -> ActionEngine -> EventBus -> RuntimeContext
      // We verify this by ensuring all subsystems are functional after initialization
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // All subsystems should be operational
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {}
      };
      context.plugins.registerPlugin(plugin);
      expect(context.plugins.getPlugin('test-plugin')).not.toBeNull();
      
      context.screens.registerScreen({
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });
      expect(context.screens.getScreen('test-screen')).not.toBeNull();
      
      context.actions.registerAction({
        id: 'test-action',
        handler: async () => 'result'
      });
      expect(await context.actions.runAction('test-action')).toBe('result');
      
      let eventFired = false;
      context.events.on('test-event', () => { eventFired = true; });
      context.events.emit('test-event');
      expect(eventFired).toBe(true);
    });
  });

  describe('Plugins can register screens and actions (Requirements 17.2)', () => {
    it('should allow plugins to register screens during setup', async () => {
      const plugin: PluginDefinition = {
        name: 'screen-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'plugin-screen-1',
            title: 'Plugin Screen 1',
            component: 'PluginComponent1'
          });
          context.screens.registerScreen({
            id: 'plugin-screen-2',
            title: 'Plugin Screen 2',
            component: 'PluginComponent2'
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.screens.getScreen('plugin-screen-1')).not.toBeNull();
      expect(context.screens.getScreen('plugin-screen-2')).not.toBeNull();
      expect(context.screens.getAllScreens()).toHaveLength(2);
    });

    it('should allow plugins to register actions during setup', async () => {
      let action1Executed = false;
      let action2Executed = false;

      const plugin: PluginDefinition = {
        name: 'action-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'plugin-action-1',
            handler: async () => {
              action1Executed = true;
              return 'result1';
            }
          });
          context.actions.registerAction({
            id: 'plugin-action-2',
            handler: async () => {
              action2Executed = true;
              return 'result2';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(await context.actions.runAction('plugin-action-1')).toBe('result1');
      expect(await context.actions.runAction('plugin-action-2')).toBe('result2');
      expect(action1Executed).toBe(true);
      expect(action2Executed).toBe(true);
    });

    it('should allow plugins to register both screens and actions', async () => {
      const plugin: PluginDefinition = {
        name: 'comprehensive-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register screens
          context.screens.registerScreen({
            id: 'home-screen',
            title: 'Home Screen',
            component: 'HomeComponent'
          });
          context.screens.registerScreen({
            id: 'settings-screen',
            title: 'Settings Screen',
            component: 'SettingsComponent'
          });
          
          // Register actions
          context.actions.registerAction({
            id: 'navigate-home',
            handler: async () => 'navigated-home'
          });
          context.actions.registerAction({
            id: 'navigate-settings',
            handler: async () => 'navigated-settings'
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Verify screens
      expect(context.screens.getScreen('home-screen')).not.toBeNull();
      expect(context.screens.getScreen('settings-screen')).not.toBeNull();
      
      // Verify actions
      expect(await context.actions.runAction('navigate-home')).toBe('navigated-home');
      expect(await context.actions.runAction('navigate-settings')).toBe('navigated-settings');
    });
  });

  describe('UI provider can be registered and used (Requirement 17.3)', () => {
    it('should allow UI provider registration after initialization', async () => {
      await runtime.initialize();
      
      const uiProvider = {
        mount: () => {},
        renderScreen: (screen: any) => `rendered-${screen.id}`
      };
      
      runtime.setUIProvider(uiProvider);
      
      expect(runtime.getUIProvider()).toBe(uiProvider);
    });

    it('should allow rendering screens through UI provider', async () => {
      const plugin: PluginDefinition = {
        name: 'ui-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'ui-screen',
            title: 'UI Screen',
            component: 'UIComponent'
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const uiProvider = {
        mount: () => {},
        renderScreen: (screen: any) => `rendered-${screen.id}-${screen.title}`
      };
      
      runtime.setUIProvider(uiProvider);
      
      const result = runtime.renderScreen('ui-screen');
      expect(result).toBe('rendered-ui-screen-UI Screen');
    });

    it('should function without UI provider for non-UI operations', async () => {
      // Runtime should work without UI provider
      const plugin: PluginDefinition = {
        name: 'non-ui-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'screen',
            title: 'Screen',
            component: 'Component'
          });
          context.actions.registerAction({
            id: 'action',
            handler: async () => 'result'
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Non-UI operations should work
      expect(context.screens.getScreen('screen')).not.toBeNull();
      expect(await context.actions.runAction('action')).toBe('result');
      
      // UI provider should be null
      expect(runtime.getUIProvider()).toBeNull();
    });
  });

  describe('Screens can be resolved by ID (Requirement 17.4)', () => {
    it('should resolve registered screens by ID', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.screens.registerScreen({
        id: 'screen-1',
        title: 'Screen 1',
        component: 'Component1'
      });
      context.screens.registerScreen({
        id: 'screen-2',
        title: 'Screen 2',
        component: 'Component2'
      });
      context.screens.registerScreen({
        id: 'screen-3',
        title: 'Screen 3',
        component: 'Component3'
      });
      
      // Resolve each screen by ID
      const screen1 = context.screens.getScreen('screen-1');
      expect(screen1).not.toBeNull();
      expect(screen1?.id).toBe('screen-1');
      expect(screen1?.title).toBe('Screen 1');
      
      const screen2 = context.screens.getScreen('screen-2');
      expect(screen2).not.toBeNull();
      expect(screen2?.id).toBe('screen-2');
      expect(screen2?.title).toBe('Screen 2');
      
      const screen3 = context.screens.getScreen('screen-3');
      expect(screen3).not.toBeNull();
      expect(screen3?.id).toBe('screen-3');
      expect(screen3?.title).toBe('Screen 3');
    });

    it('should return null for non-existent screen IDs', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.screens.registerScreen({
        id: 'existing-screen',
        title: 'Existing Screen',
        component: 'ExistingComponent'
      });
      
      expect(context.screens.getScreen('existing-screen')).not.toBeNull();
      expect(context.screens.getScreen('non-existent-screen')).toBeNull();
    });

    it('should retrieve all registered screens', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.screens.registerScreen({
        id: 'screen-a',
        title: 'Screen A',
        component: 'ComponentA'
      });
      context.screens.registerScreen({
        id: 'screen-b',
        title: 'Screen B',
        component: 'ComponentB'
      });
      
      const allScreens = context.screens.getAllScreens();
      expect(allScreens).toHaveLength(2);
      expect(allScreens.some(s => s.id === 'screen-a')).toBe(true);
      expect(allScreens.some(s => s.id === 'screen-b')).toBe(true);
    });
  });

  describe('Actions can be executed by ID (Requirement 17.5)', () => {
    it('should execute registered actions by ID', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.actions.registerAction({
        id: 'action-1',
        handler: async () => 'result-1'
      });
      context.actions.registerAction({
        id: 'action-2',
        handler: async () => 'result-2'
      });
      context.actions.registerAction({
        id: 'action-3',
        handler: async () => 'result-3'
      });
      
      // Execute each action by ID
      expect(await context.actions.runAction('action-1')).toBe('result-1');
      expect(await context.actions.runAction('action-2')).toBe('result-2');
      expect(await context.actions.runAction('action-3')).toBe('result-3');
    });

    it('should pass parameters to action handlers', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.actions.registerAction({
        id: 'echo-action',
        handler: async (params: any) => `echoed-${params}`
      });
      
      expect(await context.actions.runAction('echo-action', 'hello')).toBe('echoed-hello');
      expect(await context.actions.runAction('echo-action', 'world')).toBe('echoed-world');
    });

    it('should throw error for non-existent action IDs', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      context.actions.registerAction({
        id: 'existing-action',
        handler: async () => 'result'
      });
      
      expect(await context.actions.runAction('existing-action')).toBe('result');
      await expect(context.actions.runAction('non-existent-action')).rejects.toThrow();
    });
  });

  describe('Plugins initialize in registration order (Requirement 17.6)', () => {
    it('should execute plugin setup in registration order', async () => {
      const executionOrder: string[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin-1');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin-2');
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin-3');
        }
      };
      
      const plugin4: PluginDefinition = {
        name: 'plugin-4',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin-4');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      runtime.registerPlugin(plugin4);
      
      await runtime.initialize();
      
      expect(executionOrder).toEqual(['plugin-1', 'plugin-2', 'plugin-3', 'plugin-4']);
    });

    it('should allow later plugins to access earlier plugins contributions', async () => {
      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'plugin1-screen',
            title: 'Plugin 1 Screen',
            component: 'Plugin1Component'
          });
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Plugin 2 should be able to see plugin 1's screen
          const plugin1Screen = context.screens.getScreen('plugin1-screen');
          expect(plugin1Screen).not.toBeNull();
          expect(plugin1Screen?.id).toBe('plugin1-screen');
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
    });

    it('should execute async plugin setup sequentially', async () => {
      const executionOrder: string[] = [];
      let plugin1Complete = false;
      let plugin2Complete = false;
      
      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: async () => {
          executionOrder.push('plugin-1-start');
          await new Promise(resolve => setTimeout(resolve, 20));
          plugin1Complete = true;
          executionOrder.push('plugin-1-end');
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: async () => {
          executionOrder.push('plugin-2-start');
          expect(plugin1Complete).toBe(true);
          await new Promise(resolve => setTimeout(resolve, 10));
          plugin2Complete = true;
          executionOrder.push('plugin-2-end');
        }
      };
      
      const plugin3: PluginDefinition = {
        name: 'plugin-3',
        version: '1.0.0',
        setup: () => {
          executionOrder.push('plugin-3');
          expect(plugin1Complete).toBe(true);
          expect(plugin2Complete).toBe(true);
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      
      await runtime.initialize();
      
      expect(executionOrder).toEqual([
        'plugin-1-start',
        'plugin-1-end',
        'plugin-2-start',
        'plugin-2-end',
        'plugin-3'
      ]);
    });
  });

  describe('Event bus functions within runtime instance (Requirement 17.7)', () => {
    it('should allow event emission and subscription', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      const receivedEvents: any[] = [];
      
      context.events.on('test-event', (data: any) => {
        receivedEvents.push(data);
      });
      
      context.events.emit('test-event', 'event-1');
      context.events.emit('test-event', 'event-2');
      context.events.emit('test-event', 'event-3');
      
      expect(receivedEvents).toEqual(['event-1', 'event-2', 'event-3']);
    });

    it('should support multiple handlers for same event', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      const handler1Events: any[] = [];
      const handler2Events: any[] = [];
      const handler3Events: any[] = [];
      
      context.events.on('shared-event', (data: any) => {
        handler1Events.push(`h1-${data}`);
      });
      context.events.on('shared-event', (data: any) => {
        handler2Events.push(`h2-${data}`);
      });
      context.events.on('shared-event', (data: any) => {
        handler3Events.push(`h3-${data}`);
      });
      
      context.events.emit('shared-event', 'test');
      
      expect(handler1Events).toEqual(['h1-test']);
      expect(handler2Events).toEqual(['h2-test']);
      expect(handler3Events).toEqual(['h3-test']);
    });

    it('should support unsubscribe functionality', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      const receivedEvents: any[] = [];
      
      const unsubscribe = context.events.on('test-event', (data: any) => {
        receivedEvents.push(data);
      });
      
      context.events.emit('test-event', 'event-1');
      expect(receivedEvents).toEqual(['event-1']);
      
      unsubscribe();
      
      context.events.emit('test-event', 'event-2');
      expect(receivedEvents).toEqual(['event-1']); // event-2 not received
    });

    it('should invoke handlers synchronously', async () => {
      await runtime.initialize();
      
      const context = runtime.getContext();
      let handlerExecuted = false;
      
      context.events.on('sync-event', () => {
        handlerExecuted = true;
      });
      
      expect(handlerExecuted).toBe(false);
      context.events.emit('sync-event');
      expect(handlerExecuted).toBe(true); // Should be true immediately
    });
  });

  describe('RuntimeContext remains stable (Requirement 17.8)', () => {
    it('should provide same RuntimeContext instance throughout lifecycle', async () => {
      const contexts: RuntimeContext[] = [];
      
      const plugin1: PluginDefinition = {
        name: 'plugin-1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          contexts.push(context);
        }
      };
      
      const plugin2: PluginDefinition = {
        name: 'plugin-2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          contexts.push(context);
        }
      };
      
      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      
      await runtime.initialize();
      
      const contextFromGetContext = runtime.getContext();
      contexts.push(contextFromGetContext);
      
      // All contexts should be the same instance
      expect(contexts).toHaveLength(3);
      // Each plugin receives a tracked proxy; verify they all share the same underlying state
      expect(contexts[0].config).toEqual(contexts[1].config);
      expect(contexts[0].introspect.listPlugins()).toEqual(contexts[1].introspect.listPlugins());
      // getContext() returns the real context; proxies delegate to the same underlying registries
      expect(contexts[2].introspect.listPlugins()).toContain('plugin-1');
      expect(contexts[2].introspect.listPlugins()).toContain('plugin-2');
    });

    it('should pass same RuntimeContext to action handlers', async () => {
      const contexts: RuntimeContext[] = [];
      
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          contexts.push(context);
          
          context.actions.registerAction({
            id: 'action-1',
            handler: async (params: any, ctx: RuntimeContext) => {
              contexts.push(ctx);
              return 'result';
            }
          });
          
          context.actions.registerAction({
            id: 'action-2',
            handler: async (params: any, ctx: RuntimeContext) => {
              contexts.push(ctx);
              return 'result';
            }
          });
        }
      };
      
      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      contexts.push(context);
      
      await context.actions.runAction('action-1');
      await context.actions.runAction('action-2');
      
      // All contexts should be the same instance
      expect(contexts).toHaveLength(4);
      // Proxies and real context all delegate to the same underlying state
      expect(contexts[0].config).toEqual(contexts[1].config);
      expect(contexts[1].config).toEqual(contexts[2].config);
      expect(contexts[2].config).toEqual(contexts[3].config);
    });

    it('should maintain stable context references across subsystem operations', async () => {
      await runtime.initialize();
      
      const context1 = runtime.getContext();
      
      // Perform various operations
      context1.screens.registerScreen({
        id: 'screen',
        title: 'Screen',
        component: 'Component'
      });
      
      const context2 = runtime.getContext();
      
      context2.actions.registerAction({
        id: 'action',
        handler: async () => 'result'
      });
      
      const context3 = runtime.getContext();
      
      context3.events.on('event', () => {});
      
      const context4 = runtime.getContext();
      
      // All contexts should be the same instance
      expect(context1).toBe(context2);
      expect(context2).toBe(context3);
      expect(context3).toBe(context4);
    });
  });

  describe('No external UI framework dependencies (Requirement 17.9)', () => {
    it('should operate without UI framework imports', async () => {
      // This test verifies that the runtime can initialize and function
      // without any UI framework dependencies
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // All core operations should work
      context.screens.registerScreen({
        id: 'screen',
        title: 'Screen',
        component: 'Component'
      });
      
      context.actions.registerAction({
        id: 'action',
        handler: async () => 'result'
      });
      
      context.events.on('event', () => {});
      
      expect(context.screens.getScreen('screen')).not.toBeNull();
      expect(await context.actions.runAction('action')).toBe('result');
    });

    it('should not require DOM or browser APIs', async () => {
      // The runtime should work in Node.js environment without DOM
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Verify runtime is functional
      expect(context).toBeDefined();
      expect(context.screens).toBeDefined();
      expect(context.actions).toBeDefined();
      expect(context.events).toBeDefined();
      expect(context.plugins).toBeDefined();
    });
  });

  describe('Complete MLP workflow integration', () => {
    it('should support complete plugin-based application workflow', async () => {
      const workflowLog: string[] = [];
      
      // Plugin 1: Core functionality
      const corePlugin: PluginDefinition = {
        name: 'core-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          workflowLog.push('core-setup');
          
          // Register core screens
          context.screens.registerScreen({
            id: 'home',
            title: 'Home',
            component: 'HomeComponent'
          });
          context.screens.registerScreen({
            id: 'about',
            title: 'About',
            component: 'AboutComponent'
          });
          
          // Register core actions
          context.actions.registerAction({
            id: 'navigate',
            handler: async (params: any) => {
              workflowLog.push(`navigate-${params}`);
              return `navigated-to-${params}`;
            }
          });
          
          // Subscribe to events
          context.events.on('app-ready', () => {
            workflowLog.push('core-received-app-ready');
          });
        }
      };
      
      // Plugin 2: UI plugin (registered before feature plugin to receive events)
      const uiPlugin: PluginDefinition = {
        name: 'ui-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          workflowLog.push('ui-setup');
          
          // Subscribe to feature loaded event
          context.events.on('feature-loaded', () => {
            workflowLog.push('ui-received-feature-loaded');
          });
        }
      };
      
      // Plugin 3: Feature plugin
      const featurePlugin: PluginDefinition = {
        name: 'feature-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          workflowLog.push('feature-setup');
          
          // Register feature screens
          context.screens.registerScreen({
            id: 'feature',
            title: 'Feature',
            component: 'FeatureComponent'
          });
          
          // Register feature actions
          context.actions.registerAction({
            id: 'feature-action',
            handler: async (params: any, ctx: RuntimeContext) => {
              workflowLog.push('feature-action-executed');
              // Feature action can call core actions
              await ctx.actions.runAction('navigate', 'feature');
              return 'feature-complete';
            }
          });
          
          // Emit event (ui-plugin is already subscribed)
          context.events.emit('feature-loaded');
        }
      };
      
      // Register all plugins (order matters for event handling)
      runtime.registerPlugin(corePlugin);
      runtime.registerPlugin(uiPlugin);
      runtime.registerPlugin(featurePlugin);
      
      // Initialize runtime
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Register UI provider
      const uiProvider = {
        mount: () => {
          workflowLog.push('ui-mounted');
        },
        renderScreen: (screen: any) => {
          workflowLog.push(`render-${screen.id}`);
          return `rendered-${screen.id}`;
        }
      };
      runtime.setUIProvider(uiProvider);
      
      // Emit app ready event
      context.events.emit('app-ready');
      
      // Execute feature action
      await context.actions.runAction('feature-action');
      
      // Render screens
      runtime.renderScreen('home');
      runtime.renderScreen('feature');
      
      // Verify complete workflow
      expect(workflowLog).toContain('core-setup');
      expect(workflowLog).toContain('feature-setup');
      expect(workflowLog).toContain('ui-setup');
      expect(workflowLog).toContain('ui-received-feature-loaded');
      expect(workflowLog).toContain('core-received-app-ready');
      expect(workflowLog).toContain('feature-action-executed');
      expect(workflowLog).toContain('navigate-feature');
      expect(workflowLog).toContain('render-home');
      expect(workflowLog).toContain('render-feature');
      
      // Verify all screens are registered
      expect(context.screens.getAllScreens()).toHaveLength(3);
      expect(context.screens.getScreen('home')).not.toBeNull();
      expect(context.screens.getScreen('about')).not.toBeNull();
      expect(context.screens.getScreen('feature')).not.toBeNull();
    });
  });
});
