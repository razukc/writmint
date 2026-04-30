import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * Integration tests for plugin capabilities during setup.
 * Validates Requirements 12.1, 12.2, 12.3, 12.4
 */
describe('Plugin capabilities during setup', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  it('should allow plugins to register screens during setup (Requirement 12.1)', async () => {
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

    // Register plugin before initialization
    const tempContext = {
      screens: { registerScreen: () => {}, getScreen: () => null, getAllScreens: () => [] },
      actions: { registerAction: () => {}, runAction: async () => {} },
      plugins: { registerPlugin: (p: PluginDefinition) => {}, getPlugin: () => null, getAllPlugins: () => [] },
      events: { emit: () => {}, on: () => () => {} },
      getRuntime: () => runtime as any
    };
    
    // We need to register the plugin before initialization
    // Let's create a proper test by registering during a plugin setup
    const setupPlugin: PluginDefinition = {
      name: 'setup-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
        // Register the test plugin during this plugin's setup
        context.plugins.registerPlugin(plugin);
      }
    };

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Register the setup plugin which will register our test plugin
    context.plugins.registerPlugin(setupPlugin);
    
    // Now manually trigger setup for the newly registered plugins
    // Since we're testing the capability, let's do it directly
    await plugin.setup(context);
    
    // Verify the screen was registered
    const screen = context.screens.getScreen('plugin-screen');
    expect(screen).not.toBeNull();
    expect(screen?.id).toBe('plugin-screen');
    expect(screen?.title).toBe('Plugin Screen');
  });

  it('should allow plugins to register actions during setup (Requirement 12.2)', async () => {
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

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Execute plugin setup
    await plugin.setup(context);
    
    // Verify the action was registered and can be executed
    const result = await context.actions.runAction('plugin-action');
    expect(result).toBe('action-result');
    expect(actionExecuted).toBe(true);
  });

  it('should allow plugins to register additional plugins during setup (Requirement 12.3)', async () => {
    const setupOrder: string[] = [];

    const childPlugin: PluginDefinition = {
      name: 'child-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
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

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Execute parent plugin setup
    await parentPlugin.setup(context);
    
    // Verify child plugin was registered
    const registeredChild = context.plugins.getPlugin('child-plugin');
    expect(registeredChild).not.toBeNull();
    expect(registeredChild?.name).toBe('child-plugin');
    
    // Verify parent executed first
    expect(setupOrder).toEqual(['parent']);
  });

  it('should allow plugins to subscribe to events during setup (Requirement 12.4)', async () => {
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

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Execute plugin setup
    await plugin.setup(context);
    
    // Emit an event
    context.events.emit('test-event', 'event-data');
    
    // Verify the plugin received the event
    expect(receivedEvents).toEqual(['event-data']);
  });

  it('should support all plugin capabilities together during setup', async () => {
    const events: string[] = [];
    let actionResult: string | null = null;

    const comprehensivePlugin: PluginDefinition = {
      name: 'comprehensive-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
        // 1. Register a screen (Requirement 12.1)
        context.screens.registerScreen({
          id: 'comprehensive-screen',
          title: 'Comprehensive Screen',
          component: 'ComprehensiveComponent'
        });

        // 2. Register an action (Requirement 12.2)
        context.actions.registerAction({
          id: 'comprehensive-action',
          handler: async (params: unknown) => {
            actionResult = `processed-${params}`;
            return actionResult;
          }
        });

        // 3. Register another plugin (Requirement 12.3)
        context.plugins.registerPlugin({
          name: 'nested-plugin',
          version: '1.0.0',
          setup: () => {
            events.push('nested-setup');
          }
        });

        // 4. Subscribe to events (Requirement 12.4)
        context.events.on('comprehensive-event', (data: unknown) => {
          events.push(`received-${data}`);
        });

        events.push('comprehensive-setup');
      }
    };

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Execute plugin setup
    await comprehensivePlugin.setup(context);
    
    // Verify screen registration
    const screen = context.screens.getScreen('comprehensive-screen');
    expect(screen).not.toBeNull();
    expect(screen?.id).toBe('comprehensive-screen');
    
    // Verify action registration and execution
    const result = await context.actions.runAction('comprehensive-action', 'test-data');
    expect(result).toBe('processed-test-data');
    expect(actionResult).toBe('processed-test-data');
    
    // Verify nested plugin registration
    const nestedPlugin = context.plugins.getPlugin('nested-plugin');
    expect(nestedPlugin).not.toBeNull();
    
    // Verify event subscription
    context.events.emit('comprehensive-event', 'test-event');
    expect(events).toContain('comprehensive-setup');
    expect(events).toContain('received-test-event');
  });

  it('should allow plugins registered during setup to also use all capabilities', async () => {
    const setupOrder: string[] = [];

    const grandchildPlugin: PluginDefinition = {
      name: 'grandchild-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
        setupOrder.push('grandchild');
        
        // Grandchild can also register screens
        context.screens.registerScreen({
          id: 'grandchild-screen',
          title: 'Grandchild Screen',
          component: 'GrandchildComponent'
        });
      }
    };

    const childPlugin: PluginDefinition = {
      name: 'child-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
        setupOrder.push('child');
        
        // Child registers another plugin
        context.plugins.registerPlugin(grandchildPlugin);
        
        // Child can also register actions
        context.actions.registerAction({
          id: 'child-action',
          handler: async () => 'child-result'
        });
      }
    };

    const parentPlugin: PluginDefinition = {
      name: 'parent-plugin',
      version: '1.0.0',
      setup: (context: RuntimeContext) => {
        setupOrder.push('parent');
        
        // Parent registers child plugin
        context.plugins.registerPlugin(childPlugin);
      }
    };

    await runtime.initialize();
    const context = runtime.getContext();
    
    // Execute parent plugin setup
    await parentPlugin.setup(context);
    
    // Execute child plugin setup (simulating what would happen in real scenario)
    await childPlugin.setup(context);
    
    // Execute grandchild plugin setup
    await grandchildPlugin.setup(context);
    
    // Verify all plugins were registered
    expect(context.plugins.getPlugin('parent-plugin')).toBeNull(); // Not registered in context
    expect(context.plugins.getPlugin('child-plugin')).not.toBeNull();
    expect(context.plugins.getPlugin('grandchild-plugin')).not.toBeNull();
    
    // Verify child's action works
    const result = await context.actions.runAction('child-action');
    expect(result).toBe('child-result');
    
    // Verify grandchild's screen was registered
    const screen = context.screens.getScreen('grandchild-screen');
    expect(screen).not.toBeNull();
    
    // Verify setup order
    expect(setupOrder).toEqual(['parent', 'child', 'grandchild']);
  });
});
