import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ScreenRegistry } from '../../src/screen-registry.js';
import { ActionEngine } from '../../src/action-engine.js';
import { PluginRegistry } from '../../src/plugin-registry.js';
import { ConsoleLogger, ValidationError, ScreenDefinition, ActionDefinition, PluginDefinition } from '../../src/types.js';

/**
 * Property 10: Validation Before Mutation
 * 
 * Feature: runtime-hardening, Property 10: Validation Before Mutation
 * 
 * For any registration operation, validation errors should be thrown
 * before any state modification occurs
 * 
 * Validates: Requirements 18.5, 19.5, 20.5
 */
describe('Property 10: Validation Before Mutation', () => {
  describe('ScreenRegistry validation before mutation', () => {
    it('should not modify state when screen validation fails', () => {
      fc.assert(
        fc.property(
          // Generate valid screens to populate registry
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              component: fc.string({ minLength: 1, maxLength: 30 })
            }),
            { minLength: 0, maxLength: 5 }
          ),
          // Generate invalid screen (missing fields or wrong types)
          fc.oneof(
            // Missing id
            fc.record({
              id: fc.constant(''),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              component: fc.string({ minLength: 1, maxLength: 30 })
            }),
            // Missing title
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.constant(''),
              component: fc.string({ minLength: 1, maxLength: 30 })
            }),
            // Missing component
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              component: fc.constant('')
            }),
            // Wrong type for id (null)
            fc.record({
              id: fc.constant(null as any),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              component: fc.string({ minLength: 1, maxLength: 30 })
            }),
            // Wrong type for title (number)
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.constant(123 as any),
              component: fc.string({ minLength: 1, maxLength: 30 })
            }),
            // Wrong type for component (object)
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              component: fc.constant({} as any)
            })
          ),
          (validScreens, invalidScreen) => {
            const logger = new ConsoleLogger();
            const registry = new ScreenRegistry(logger);
            
            // Register valid screens
            const uniqueValidScreens = new Map<string, ScreenDefinition>();
            for (const screen of validScreens) {
              if (!uniqueValidScreens.has(screen.id)) {
                uniqueValidScreens.set(screen.id, screen);
                registry.registerScreen(screen);
              }
            }
            
            // Capture state before invalid registration
            const screensBefore = registry.getAllScreens();
            const countBefore = screensBefore.length;
            
            // Attempt to register invalid screen
            let errorThrown = false;
            try {
              registry.registerScreen(invalidScreen as ScreenDefinition);
            } catch (error) {
              errorThrown = true;
              expect(error).toBeInstanceOf(ValidationError);
            }
            
            // Verify error was thrown
            expect(errorThrown).toBe(true);
            
            // Verify state is unchanged
            const screensAfter = registry.getAllScreens();
            const countAfter = screensAfter.length;
            
            expect(countAfter).toBe(countBefore);
            expect(screensAfter).toEqual(screensBefore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ActionEngine validation before mutation', () => {
    it('should not modify state when action validation fails', () => {
      fc.assert(
        fc.property(
          // Generate valid actions to populate registry
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              handler: fc.constant(async () => 'result')
            }),
            { minLength: 0, maxLength: 5 }
          ),
          // Generate invalid action (missing fields or wrong types)
          fc.oneof(
            // Missing id
            fc.record({
              id: fc.constant(''),
              handler: fc.constant(async () => 'result')
            }),
            // Missing handler
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              handler: fc.constant(null as any)
            }),
            // Wrong type for id (undefined)
            fc.record({
              id: fc.constant(undefined as any),
              handler: fc.constant(async () => 'result')
            }),
            // Wrong type for handler (string)
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              handler: fc.constant('not a function' as any)
            }),
            // Wrong type for handler (number)
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              handler: fc.constant(42 as any)
            }),
            // Wrong type for handler (object)
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              handler: fc.constant({} as any)
            })
          ),
          (validActions, invalidAction) => {
            const logger = new ConsoleLogger();
            const engine = new ActionEngine(logger);
            
            // Register valid actions
            const uniqueValidActions = new Map<string, ActionDefinition>();
            for (const action of validActions) {
              if (!uniqueValidActions.has(action.id)) {
                uniqueValidActions.set(action.id, action);
                engine.registerAction(action);
              }
            }
            
            // Capture state before invalid registration
            const actionsBefore = engine.getAllActions();
            const countBefore = actionsBefore.length;
            
            // Attempt to register invalid action
            let errorThrown = false;
            try {
              engine.registerAction(invalidAction as ActionDefinition);
            } catch (error) {
              errorThrown = true;
              expect(error).toBeInstanceOf(ValidationError);
            }
            
            // Verify error was thrown
            expect(errorThrown).toBe(true);
            
            // Verify state is unchanged
            const actionsAfter = engine.getAllActions();
            const countAfter = actionsAfter.length;
            
            expect(countAfter).toBe(countBefore);
            expect(actionsAfter).toEqual(actionsBefore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('PluginRegistry validation before mutation', () => {
    it('should not modify state when plugin validation fails', () => {
      fc.assert(
        fc.property(
          // Generate valid plugins to populate registry
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              setup: fc.constant(async () => {})
            }),
            { minLength: 0, maxLength: 5 }
          ),
          // Generate invalid plugin (missing fields or wrong types)
          fc.oneof(
            // Missing name
            fc.record({
              name: fc.constant(''),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              setup: fc.constant(async () => {})
            }),
            // Missing version
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.constant(''),
              setup: fc.constant(async () => {})
            }),
            // Missing setup
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              setup: fc.constant(null as any)
            }),
            // Wrong type for name (number)
            fc.record({
              name: fc.constant(456 as any),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              setup: fc.constant(async () => {})
            }),
            // Wrong type for version (boolean)
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.constant(true as any),
              setup: fc.constant(async () => {})
            }),
            // Wrong type for setup (string)
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              setup: fc.constant('not a function' as any)
            })
          ),
          (validPlugins, invalidPlugin) => {
            const logger = new ConsoleLogger();
            const registry = new PluginRegistry(logger);
            
            // Register valid plugins
            const uniqueValidPlugins = new Map<string, PluginDefinition>();
            for (const plugin of validPlugins) {
              if (!uniqueValidPlugins.has(plugin.name)) {
                uniqueValidPlugins.set(plugin.name, plugin);
                registry.registerPlugin(plugin);
              }
            }
            
            // Capture state before invalid registration
            const pluginsBefore = registry.getAllPlugins();
            const countBefore = pluginsBefore.length;
            
            // Attempt to register invalid plugin
            let errorThrown = false;
            try {
              registry.registerPlugin(invalidPlugin as PluginDefinition);
            } catch (error) {
              errorThrown = true;
              expect(error).toBeInstanceOf(ValidationError);
            }
            
            // Verify error was thrown
            expect(errorThrown).toBe(true);
            
            // Verify state is unchanged
            const pluginsAfter = registry.getAllPlugins();
            const countAfter = pluginsAfter.length;
            
            expect(countAfter).toBe(countBefore);
            expect(pluginsAfter).toEqual(pluginsBefore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cross-registry validation isolation', () => {
    it('should not affect other registries when one fails validation', () => {
      fc.assert(
        fc.property(
          // Generate valid screen
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            component: fc.string({ minLength: 1, maxLength: 30 })
          }),
          // Generate valid action
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            handler: fc.constant(async () => 'result')
          }),
          // Generate invalid plugin
          fc.record({
            name: fc.constant(''),
            version: fc.string({ minLength: 1, maxLength: 10 }),
            setup: fc.constant(async () => {})
          }),
          (validScreen, validAction, invalidPlugin) => {
            const logger = new ConsoleLogger();
            const screenRegistry = new ScreenRegistry(logger);
            const actionEngine = new ActionEngine(logger);
            const pluginRegistry = new PluginRegistry(logger);
            
            // Register valid items in screen and action registries
            screenRegistry.registerScreen(validScreen);
            actionEngine.registerAction(validAction);
            
            // Capture state
            const screensBefore = screenRegistry.getAllScreens();
            const actionsBefore = actionEngine.getAllActions();
            const pluginsBefore = pluginRegistry.getAllPlugins();
            
            // Attempt to register invalid plugin
            let errorThrown = false;
            try {
              pluginRegistry.registerPlugin(invalidPlugin as PluginDefinition);
            } catch (error) {
              errorThrown = true;
              expect(error).toBeInstanceOf(ValidationError);
            }
            
            // Verify error was thrown
            expect(errorThrown).toBe(true);
            
            // Verify other registries are unchanged
            expect(screenRegistry.getAllScreens()).toEqual(screensBefore);
            expect(actionEngine.getAllActions()).toEqual(actionsBefore);
            expect(pluginRegistry.getAllPlugins()).toEqual(pluginsBefore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
