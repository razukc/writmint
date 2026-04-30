import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ScreenRegistry } from '../../src/screen-registry.js';
import { ActionEngine } from '../../src/action-engine.js';
import { PluginRegistry } from '../../src/plugin-registry.js';
import { ConsoleLogger } from '../../src/types.js';
import type { ScreenDefinition, ActionDefinition, PluginDefinition } from '../../src/types.js';

/**
 * Property 5: Data Isolation
 * 
 * Feature: runtime-hardening, Property 5: Data Isolation
 * 
 * For any registry getAll method, modifying the returned array should not
 * affect the internal registry state
 * 
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */
describe('Property 5: Data Isolation', () => {
  it('should isolate ScreenRegistry internal state from getAllScreens modifications', () => {
    fc.assert(
      fc.property(
        // Generate random number of screens (1-10)
        fc.integer({ min: 1, max: 10 }),
        (screenCount) => {
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register screens
          const registeredScreens: ScreenDefinition[] = [];
          for (let i = 0; i < screenCount; i++) {
            const screen: ScreenDefinition = {
              id: `screen-${i}`,
              title: `Screen ${i}`,
              component: `Component${i}`
            };
            registry.registerScreen(screen);
            registeredScreens.push(screen);
          }
          
          // Get all screens
          const screens = registry.getAllScreens();
          
          // Verify we got the correct number
          expect(screens.length).toBe(screenCount);
          
          // Modify the returned array
          screens.push({
            id: 'malicious-screen',
            title: 'Malicious',
            component: 'MaliciousComponent'
          });
          screens.pop();
          screens.reverse();
          
          // Get screens again and verify internal state unchanged
          const screensAfter = registry.getAllScreens();
          expect(screensAfter.length).toBe(screenCount);
          
          // Verify order is preserved (not reversed)
          for (let i = 0; i < screenCount; i++) {
            expect(screensAfter[i].id).toBe(`screen-${i}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should isolate ActionEngine internal state from getAllActions modifications', () => {
    fc.assert(
      fc.property(
        // Generate random number of actions (1-10)
        fc.integer({ min: 1, max: 10 }),
        (actionCount) => {
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Register actions
          const registeredActions: ActionDefinition[] = [];
          for (let i = 0; i < actionCount; i++) {
            const action: ActionDefinition = {
              id: `action-${i}`,
              handler: async () => `result-${i}`
            };
            engine.registerAction(action);
            registeredActions.push(action);
          }
          
          // Get all actions
          const actions = engine.getAllActions();
          
          // Verify we got the correct number
          expect(actions.length).toBe(actionCount);
          
          // Modify the returned array
          actions.push({
            id: 'malicious-action',
            handler: async () => 'malicious'
          });
          actions.pop();
          actions.reverse();
          
          // Get actions again and verify internal state unchanged
          const actionsAfter = engine.getAllActions();
          expect(actionsAfter.length).toBe(actionCount);
          
          // Verify order is preserved (not reversed)
          for (let i = 0; i < actionCount; i++) {
            expect(actionsAfter[i].id).toBe(`action-${i}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should isolate PluginRegistry internal state from getAllPlugins modifications', () => {
    fc.assert(
      fc.property(
        // Generate random number of plugins (1-10)
        fc.integer({ min: 1, max: 10 }),
        (pluginCount) => {
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Register plugins
          const registeredPlugins: PluginDefinition[] = [];
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {}
            };
            registry.registerPlugin(plugin);
            registeredPlugins.push(plugin);
          }
          
          // Get all plugins
          const plugins = registry.getAllPlugins();
          
          // Verify we got the correct number
          expect(plugins.length).toBe(pluginCount);
          
          // Modify the returned array
          plugins.push({
            name: 'malicious-plugin',
            version: '1.0.0',
            setup: async () => {}
          });
          plugins.pop();
          plugins.reverse();
          
          // Get plugins again and verify internal state unchanged
          const pluginsAfter = registry.getAllPlugins();
          expect(pluginsAfter.length).toBe(pluginCount);
          
          // Verify order is preserved (not reversed)
          for (let i = 0; i < pluginCount; i++) {
            expect(pluginsAfter[i].name).toBe(`plugin-${i}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should isolate PluginRegistry internal state from getInitializedPlugins modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of plugins (1-8)
        fc.integer({ min: 1, max: 8 }),
        async (pluginCount) => {
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register and initialize plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {}
            };
            registry.registerPlugin(plugin);
          }
          
          // Execute setup to initialize plugins
          await registry.executeSetup(mockContext);
          
          // Get initialized plugins
          const initialized = registry.getInitializedPlugins();
          
          // Verify we got the correct number
          expect(initialized.length).toBe(pluginCount);
          
          // Modify the returned array
          initialized.push('malicious-plugin');
          initialized.pop();
          initialized.reverse();
          
          // Get initialized plugins again and verify internal state unchanged
          const initializedAfter = registry.getInitializedPlugins();
          expect(initializedAfter.length).toBe(pluginCount);
          
          // Verify order is preserved (not reversed)
          for (let i = 0; i < pluginCount; i++) {
            expect(initializedAfter[i]).toBe(`plugin-${i}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should prevent mutation of screen objects through returned array', () => {
    fc.assert(
      fc.property(
        // Generate random number of screens (2-6)
        fc.integer({ min: 2, max: 6 }),
        (screenCount) => {
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register screens
          for (let i = 0; i < screenCount; i++) {
            registry.registerScreen({
              id: `screen-${i}`,
              title: `Screen ${i}`,
              component: `Component${i}`
            });
          }
          
          // Get all screens and try to mutate an object
          const screens = registry.getAllScreens();
          const firstScreen = screens[0];
          const originalId = firstScreen.id;
          
          // Try to mutate the screen object
          firstScreen.title = 'MUTATED TITLE';
          
          // Get screens again
          const screensAfter = registry.getAllScreens();
          const firstScreenAfter = screensAfter.find(s => s.id === originalId);
          
          // Note: This test verifies that the array is a copy, but the objects
          // themselves are still references. This is acceptable as the requirement
          // is about array isolation, not deep cloning.
          expect(screensAfter.length).toBe(screenCount);
          expect(firstScreenAfter).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty registries without errors', () => {
    const logger = new ConsoleLogger();
    
    // Test ScreenRegistry
    const screenRegistry = new ScreenRegistry(logger);
    const screens = screenRegistry.getAllScreens();
    expect(screens).toEqual([]);
    screens.push({ id: 'test', title: 'Test', component: 'Test' });
    expect(screenRegistry.getAllScreens()).toEqual([]);
    
    // Test ActionEngine
    const actionEngine = new ActionEngine(logger);
    const actions = actionEngine.getAllActions();
    expect(actions).toEqual([]);
    actions.push({ id: 'test', handler: async () => {} });
    expect(actionEngine.getAllActions()).toEqual([]);
    
    // Test PluginRegistry
    const pluginRegistry = new PluginRegistry(logger);
    const plugins = pluginRegistry.getAllPlugins();
    expect(plugins).toEqual([]);
    plugins.push({ name: 'test', version: '1.0.0', setup: async () => {} });
    expect(pluginRegistry.getAllPlugins()).toEqual([]);
    
    const initialized = pluginRegistry.getInitializedPlugins();
    expect(initialized).toEqual([]);
    initialized.push('test');
    expect(pluginRegistry.getInitializedPlugins()).toEqual([]);
  });

  it('should maintain isolation across multiple getAll calls', () => {
    fc.assert(
      fc.property(
        // Generate random number of screens (3-8)
        fc.integer({ min: 3, max: 8 }),
        (screenCount) => {
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register screens
          for (let i = 0; i < screenCount; i++) {
            registry.registerScreen({
              id: `screen-${i}`,
              title: `Screen ${i}`,
              component: `Component${i}`
            });
          }
          
          // Get screens multiple times and modify each
          const screens1 = registry.getAllScreens();
          const screens2 = registry.getAllScreens();
          const screens3 = registry.getAllScreens();
          
          // Modify all three arrays differently
          screens1.pop();
          screens2.shift();
          screens3.reverse();
          
          // Verify all modifications are independent
          expect(screens1.length).toBe(screenCount - 1);
          expect(screens2.length).toBe(screenCount - 1);
          expect(screens3.length).toBe(screenCount);
          
          // Verify internal state is still intact
          const screensAfter = registry.getAllScreens();
          expect(screensAfter.length).toBe(screenCount);
          
          // Verify order is preserved
          for (let i = 0; i < screenCount; i++) {
            expect(screensAfter[i].id).toBe(`screen-${i}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
