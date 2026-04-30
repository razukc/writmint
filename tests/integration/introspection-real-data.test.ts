import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext, ScreenDefinition, ActionDefinition } from '../../src/types.js';

/**
 * Integration tests for introspection API with real data.
 * Verifies that introspection APIs return accurate metadata for registered resources
 * and that all metadata is properly frozen.
 * 
 * Tests Requirements: 3.1, 4.1, 5.1, 6.1
 */
describe('Introspection with real data integration tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  afterEach(async () => {
    if (runtime.isInitialized()) {
      await runtime.shutdown();
    }
  });

  describe('Action introspection with real data', () => {
    it('should return accurate metadata for registered actions (Requirement 3.1)', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      // Register multiple actions with different configurations
      context.actions.registerAction({
        id: 'action1',
        handler: async () => 'result1'
      });

      context.actions.registerAction({
        id: 'action2',
        handler: async () => 'result2',
        timeout: 5000
      });

      context.actions.registerAction({
        id: 'action3',
        handler: async () => 'result3',
        timeout: 10000
      });

      // Query via introspection
      const actionIds = context.introspect.listActions();
      expect(actionIds).toHaveLength(3);
      expect(actionIds).toContain('action1');
      expect(actionIds).toContain('action2');
      expect(actionIds).toContain('action3');

      // Get metadata for each action
      const action1Meta = context.introspect.getActionDefinition('action1');
      expect(action1Meta).not.toBeNull();
      expect(action1Meta?.id).toBe('action1');
      expect(action1Meta?.timeout).toBeUndefined();

      const action2Meta = context.introspect.getActionDefinition('action2');
      expect(action2Meta).not.toBeNull();
      expect(action2Meta?.id).toBe('action2');
      expect(action2Meta?.timeout).toBe(5000);

      const action3Meta = context.introspect.getActionDefinition('action3');
      expect(action3Meta).not.toBeNull();
      expect(action3Meta?.id).toBe('action3');
      expect(action3Meta?.timeout).toBe(10000);
    });

    it('should not expose handler functions in action metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.actions.registerAction({
        id: 'test-action',
        handler: async () => 'result'
      });

      const metadata = context.introspect.getActionDefinition('test-action');
      expect(metadata).not.toBeNull();
      
      // Verify no handler property exists
      expect(metadata).not.toHaveProperty('handler');
      
      // Verify no functions in metadata
      const hasFunction = Object.values(metadata!).some(val => typeof val === 'function');
      expect(hasFunction).toBe(false);
    });

    it('should return frozen action metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.actions.registerAction({
        id: 'test-action',
        handler: async () => 'result',
        timeout: 5000
      });

      const metadata = context.introspect.getActionDefinition('test-action');
      expect(metadata).not.toBeNull();
      
      // Verify metadata is frozen
      expect(Object.isFrozen(metadata)).toBe(true);
      
      // Attempt mutation should throw
      expect(() => {
        (metadata as any).id = 'changed';
      }).toThrow();

      expect(() => {
        (metadata as any).newProperty = 'value';
      }).toThrow();
    });

    it('should return null for non-existent action', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      const metadata = context.introspect.getActionDefinition('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('Plugin introspection with real data', () => {
    it('should return accurate metadata for registered plugins (Requirement 4.1)', async () => {
      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {}
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '2.5.3',
        setup: () => {},
        dispose: () => {}
      };

      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '0.1.0-beta',
        setup: () => {}
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      await runtime.initialize();

      const context = runtime.getContext();

      // Query via introspection
      const pluginNames = context.introspect.listPlugins();
      expect(pluginNames).toHaveLength(3);
      expect(pluginNames).toContain('plugin1');
      expect(pluginNames).toContain('plugin2');
      expect(pluginNames).toContain('plugin3');

      // Get metadata for each plugin
      const plugin1Meta = context.introspect.getPluginDefinition('plugin1');
      expect(plugin1Meta).not.toBeNull();
      expect(plugin1Meta?.name).toBe('plugin1');
      expect(plugin1Meta?.version).toBe('1.0.0');

      const plugin2Meta = context.introspect.getPluginDefinition('plugin2');
      expect(plugin2Meta).not.toBeNull();
      expect(plugin2Meta?.name).toBe('plugin2');
      expect(plugin2Meta?.version).toBe('2.5.3');

      const plugin3Meta = context.introspect.getPluginDefinition('plugin3');
      expect(plugin3Meta).not.toBeNull();
      expect(plugin3Meta?.name).toBe('plugin3');
      expect(plugin3Meta?.version).toBe('0.1.0-beta');
    });

    it('should not expose setup/dispose functions in plugin metadata', async () => {
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {}
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const metadata = context.introspect.getPluginDefinition('test-plugin');
      
      expect(metadata).not.toBeNull();
      
      // Verify no setup/dispose properties exist
      expect(metadata).not.toHaveProperty('setup');
      expect(metadata).not.toHaveProperty('dispose');
      
      // Verify no functions in metadata
      const hasFunction = Object.values(metadata!).some(val => typeof val === 'function');
      expect(hasFunction).toBe(false);
    });

    it('should return frozen plugin metadata', async () => {
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {}
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const metadata = context.introspect.getPluginDefinition('test-plugin');
      
      expect(metadata).not.toBeNull();
      
      // Verify metadata is frozen
      expect(Object.isFrozen(metadata)).toBe(true);
      
      // Attempt mutation should throw
      expect(() => {
        (metadata as any).name = 'changed';
      }).toThrow();

      expect(() => {
        (metadata as any).newProperty = 'value';
      }).toThrow();
    });

    it('should return null for non-existent plugin', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      const metadata = context.introspect.getPluginDefinition('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('Screen introspection with real data', () => {
    it('should return accurate metadata for registered screens (Requirement 5.1)', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      // Register multiple screens
      context.screens.registerScreen({
        id: 'screen1',
        title: 'Screen 1',
        component: 'Component1'
      });

      context.screens.registerScreen({
        id: 'screen2',
        title: 'Screen 2',
        component: 'Component2'
      });

      context.screens.registerScreen({
        id: 'screen3',
        title: 'Screen 3',
        component: 'Component3'
      });

      // Query via introspection
      const screenIds = context.introspect.listScreens();
      expect(screenIds).toHaveLength(3);
      expect(screenIds).toContain('screen1');
      expect(screenIds).toContain('screen2');
      expect(screenIds).toContain('screen3');

      // Get metadata for each screen
      const screen1Meta = context.introspect.getScreenDefinition('screen1');
      expect(screen1Meta).not.toBeNull();
      expect(screen1Meta?.id).toBe('screen1');
      expect(screen1Meta?.title).toBe('Screen 1');
      expect(screen1Meta?.component).toBe('Component1');

      const screen2Meta = context.introspect.getScreenDefinition('screen2');
      expect(screen2Meta).not.toBeNull();
      expect(screen2Meta?.id).toBe('screen2');
      expect(screen2Meta?.title).toBe('Screen 2');
      expect(screen2Meta?.component).toBe('Component2');

      const screen3Meta = context.introspect.getScreenDefinition('screen3');
      expect(screen3Meta).not.toBeNull();
      expect(screen3Meta?.id).toBe('screen3');
      expect(screen3Meta?.title).toBe('Screen 3');
      expect(screen3Meta?.component).toBe('Component3');
    });

    it('should include all screen properties in metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      const screen: ScreenDefinition = {
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      };

      context.screens.registerScreen(screen);

      const metadata = context.introspect.getScreenDefinition('test-screen');
      expect(metadata).not.toBeNull();
      
      // Verify all properties are present
      expect(metadata?.id).toBe('test-screen');
      expect(metadata?.title).toBe('Test Screen');
      expect(metadata?.component).toBe('TestComponent');
    });

    it('should return frozen screen metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.screens.registerScreen({
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });

      const metadata = context.introspect.getScreenDefinition('test-screen');
      expect(metadata).not.toBeNull();
      
      // Verify metadata is frozen
      expect(Object.isFrozen(metadata)).toBe(true);
      
      // Attempt mutation should throw
      expect(() => {
        (metadata as any).id = 'changed';
      }).toThrow();

      expect(() => {
        (metadata as any).newProperty = 'value';
      }).toThrow();
    });

    it('should return null for non-existent screen', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      const metadata = context.introspect.getScreenDefinition('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('Runtime metadata with real data', () => {
    it('should return accurate runtime statistics (Requirement 6.1)', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      // Initially no resources
      let metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(0);
      expect(metadata.totalPlugins).toBe(0);
      expect(metadata.totalScreens).toBe(0);
      expect(metadata.runtimeVersion).toBe('0.1.0');

      // Register some resources
      context.actions.registerAction({
        id: 'action1',
        handler: async () => 'result'
      });

      context.actions.registerAction({
        id: 'action2',
        handler: async () => 'result'
      });

      context.screens.registerScreen({
        id: 'screen1',
        title: 'Screen 1',
        component: 'Component1'
      });

      // Query again
      metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(2);
      expect(metadata.totalPlugins).toBe(0);
      expect(metadata.totalScreens).toBe(1);
      expect(metadata.runtimeVersion).toBe('0.1.0');
    });

    it('should count plugins correctly', async () => {
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

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();

      const context = runtime.getContext();
      const metadata = context.introspect.getMetadata();

      expect(metadata.totalPlugins).toBe(2);
    });

    it('should return frozen runtime metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      const metadata = context.introspect.getMetadata();
      
      // Verify metadata is frozen
      expect(Object.isFrozen(metadata)).toBe(true);
      
      // Attempt mutation should throw
      expect(() => {
        (metadata as any).totalActions = 999;
      }).toThrow();

      expect(() => {
        (metadata as any).newProperty = 'value';
      }).toThrow();
    });
  });

  describe('Comprehensive introspection scenario', () => {
    it('should provide accurate introspection for complex runtime state', async () => {
      // Register plugins that contribute resources
      const plugin1: PluginDefinition = {
        name: 'data-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'data-screen',
            title: 'Data Screen',
            component: 'DataComponent'
          });

          context.actions.registerAction({
            id: 'fetch-data',
            handler: async () => ({ data: [] }),
            timeout: 5000
          });

          context.actions.registerAction({
            id: 'save-data',
            handler: async () => ({ success: true })
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'ui-plugin',
        version: '2.0.0',
        setup: (context: RuntimeContext) => {
          context.screens.registerScreen({
            id: 'home-screen',
            title: 'Home',
            component: 'HomeComponent'
          });

          context.screens.registerScreen({
            id: 'settings-screen',
            title: 'Settings',
            component: 'SettingsComponent'
          });

          context.actions.registerAction({
            id: 'navigate',
            handler: async () => ({ navigated: true }),
            timeout: 1000
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();

      const context = runtime.getContext();

      // Verify counts match registered resources
      const metadata = context.introspect.getMetadata();
      expect(metadata.totalPlugins).toBe(2);
      expect(metadata.totalActions).toBe(3);
      expect(metadata.totalScreens).toBe(3);

      // Verify all actions are listed
      const actionIds = context.introspect.listActions();
      expect(actionIds).toHaveLength(3);
      expect(actionIds).toContain('fetch-data');
      expect(actionIds).toContain('save-data');
      expect(actionIds).toContain('navigate');

      // Verify all plugins are listed
      const pluginNames = context.introspect.listPlugins();
      expect(pluginNames).toHaveLength(2);
      expect(pluginNames).toContain('data-plugin');
      expect(pluginNames).toContain('ui-plugin');

      // Verify all screens are listed
      const screenIds = context.introspect.listScreens();
      expect(screenIds).toHaveLength(3);
      expect(screenIds).toContain('data-screen');
      expect(screenIds).toContain('home-screen');
      expect(screenIds).toContain('settings-screen');

      // Verify action metadata is accurate
      const fetchDataMeta = context.introspect.getActionDefinition('fetch-data');
      expect(fetchDataMeta?.id).toBe('fetch-data');
      expect(fetchDataMeta?.timeout).toBe(5000);

      const saveDataMeta = context.introspect.getActionDefinition('save-data');
      expect(saveDataMeta?.id).toBe('save-data');
      expect(saveDataMeta?.timeout).toBeUndefined();

      const navigateMeta = context.introspect.getActionDefinition('navigate');
      expect(navigateMeta?.id).toBe('navigate');
      expect(navigateMeta?.timeout).toBe(1000);

      // Verify plugin metadata is accurate
      const dataPluginMeta = context.introspect.getPluginDefinition('data-plugin');
      expect(dataPluginMeta?.name).toBe('data-plugin');
      expect(dataPluginMeta?.version).toBe('1.0.0');

      const uiPluginMeta = context.introspect.getPluginDefinition('ui-plugin');
      expect(uiPluginMeta?.name).toBe('ui-plugin');
      expect(uiPluginMeta?.version).toBe('2.0.0');

      // Verify screen metadata is accurate
      const dataScreenMeta = context.introspect.getScreenDefinition('data-screen');
      expect(dataScreenMeta?.id).toBe('data-screen');
      expect(dataScreenMeta?.title).toBe('Data Screen');

      const homeScreenMeta = context.introspect.getScreenDefinition('home-screen');
      expect(homeScreenMeta?.id).toBe('home-screen');
      expect(homeScreenMeta?.title).toBe('Home');

      const settingsScreenMeta = context.introspect.getScreenDefinition('settings-screen');
      expect(settingsScreenMeta?.id).toBe('settings-screen');
      expect(settingsScreenMeta?.title).toBe('Settings');
    });

    it('should handle dynamic resource registration', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      // Initially empty
      expect(context.introspect.listActions()).toHaveLength(0);
      expect(context.introspect.listScreens()).toHaveLength(0);

      // Register action dynamically
      context.actions.registerAction({
        id: 'dynamic-action',
        handler: async () => 'result'
      });

      // Introspection should reflect the change
      expect(context.introspect.listActions()).toHaveLength(1);
      expect(context.introspect.listActions()).toContain('dynamic-action');

      // Register screen dynamically
      context.screens.registerScreen({
        id: 'dynamic-screen',
        title: 'Dynamic Screen',
        component: 'DynamicComponent'
      });

      // Introspection should reflect the change
      expect(context.introspect.listScreens()).toHaveLength(1);
      expect(context.introspect.listScreens()).toContain('dynamic-screen');

      // Metadata should be updated
      const metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(1);
      expect(metadata.totalScreens).toBe(1);
    });

    it('should maintain metadata immutability across multiple queries', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.actions.registerAction({
        id: 'test-action',
        handler: async () => 'result',
        timeout: 5000
      });

      // Query multiple times
      const meta1 = context.introspect.getActionDefinition('test-action');
      const meta2 = context.introspect.getActionDefinition('test-action');
      const meta3 = context.introspect.getActionDefinition('test-action');

      // All should be frozen
      expect(Object.isFrozen(meta1)).toBe(true);
      expect(Object.isFrozen(meta2)).toBe(true);
      expect(Object.isFrozen(meta3)).toBe(true);

      // All should have same values
      expect(meta1?.id).toBe('test-action');
      expect(meta2?.id).toBe('test-action');
      expect(meta3?.id).toBe('test-action');

      expect(meta1?.timeout).toBe(5000);
      expect(meta2?.timeout).toBe(5000);
      expect(meta3?.timeout).toBe(5000);
    });
  });

  describe('Introspection metadata consistency', () => {
    it('should return consistent metadata across multiple queries', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.screens.registerScreen({
        id: 'test-screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });

      // Query multiple times
      const meta1 = context.introspect.getScreenDefinition('test-screen');
      const meta2 = context.introspect.getScreenDefinition('test-screen');
      const meta3 = context.introspect.getScreenDefinition('test-screen');

      // All should have same values
      expect(meta1?.id).toBe('test-screen');
      expect(meta2?.id).toBe('test-screen');
      expect(meta3?.id).toBe('test-screen');

      expect(meta1?.title).toBe('Test Screen');
      expect(meta2?.title).toBe('Test Screen');
      expect(meta3?.title).toBe('Test Screen');

      expect(meta1?.component).toBe('TestComponent');
      expect(meta2?.component).toBe('TestComponent');
      expect(meta3?.component).toBe('TestComponent');

      // All should be frozen
      expect(Object.isFrozen(meta1)).toBe(true);
      expect(Object.isFrozen(meta2)).toBe(true);
      expect(Object.isFrozen(meta3)).toBe(true);
    });

    it('should prevent any mutation attempts on metadata', async () => {
      await runtime.initialize();
      const context = runtime.getContext();

      context.screens.registerScreen({
        id: 'immutable-screen',
        title: 'Immutable Screen',
        component: 'ImmutableComponent'
      });

      const metadata = context.introspect.getScreenDefinition('immutable-screen');
      expect(metadata).not.toBeNull();

      // Attempt to mutate properties should throw
      expect(() => {
        (metadata as any).id = 'changed-id';
      }).toThrow();

      expect(() => {
        (metadata as any).title = 'Changed Title';
      }).toThrow();

      expect(() => {
        (metadata as any).component = 'ChangedComponent';
      }).toThrow();

      expect(() => {
        (metadata as any).newProperty = 'value';
      }).toThrow();
    });
  });
});
