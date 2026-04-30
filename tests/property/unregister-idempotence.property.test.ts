import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 4: Unregister Idempotence
 * 
 * Feature: runtime-hardening, Property 4: Unregister Idempotence
 * 
 * For any registered resource (screen or action), calling the unregister function
 * multiple times should be safe and result in the resource being removed
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('Property 4: Unregister Idempotence', () => {
  it('should safely call screen unregister function multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of screens (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate random number of times to call unregister (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (screenCount, unregisterCalls) => {
          const { ScreenRegistry } = await import('../../src/screen-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register screens and collect unregister functions
          const unregisterFunctions: Array<() => void> = [];
          const screenIds: string[] = [];
          
          for (let i = 0; i < screenCount; i++) {
            const screenId = `screen-${i}`;
            screenIds.push(screenId);
            
            const unregister = registry.registerScreen({
              id: screenId,
              title: `Screen ${i}`,
              component: `Component${i}`
            });
            
            unregisterFunctions.push(unregister);
          }
          
          // Verify all screens are registered
          expect(registry.getAllScreens().length).toBe(screenCount);
          
          // Pick a random screen to unregister multiple times
          const targetIndex = screenCount > 1 ? Math.floor(Math.random() * screenCount) : 0;
          const targetUnregister = unregisterFunctions[targetIndex];
          const targetScreenId = screenIds[targetIndex];
          
          // Call unregister multiple times
          for (let i = 0; i < unregisterCalls; i++) {
            // Should not throw
            expect(() => targetUnregister()).not.toThrow();
          }
          
          // Verify the screen is removed
          expect(registry.getScreen(targetScreenId)).toBeNull();
          
          // Verify other screens are still present
          const remainingScreens = registry.getAllScreens();
          expect(remainingScreens.length).toBe(screenCount - 1);
          
          // Verify the removed screen is not in the list
          expect(remainingScreens.find(s => s.id === targetScreenId)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should safely call action unregister function multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of actions (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate random number of times to call unregister (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (actionCount, unregisterCalls) => {
          const { ActionEngine } = await import('../../src/action-engine.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          // Register actions and collect unregister functions
          const unregisterFunctions: Array<() => void> = [];
          const actionIds: string[] = [];
          
          for (let i = 0; i < actionCount; i++) {
            const actionId = `action-${i}`;
            actionIds.push(actionId);
            
            const unregister = engine.registerAction({
              id: actionId,
              handler: async () => ({ result: i })
            });
            
            unregisterFunctions.push(unregister);
          }
          
          // Verify all actions are registered
          expect(engine.getAllActions().length).toBe(actionCount);
          
          // Pick a random action to unregister multiple times
          const targetIndex = actionCount > 1 ? Math.floor(Math.random() * actionCount) : 0;
          const targetUnregister = unregisterFunctions[targetIndex];
          const targetActionId = actionIds[targetIndex];
          
          // Call unregister multiple times
          for (let i = 0; i < unregisterCalls; i++) {
            // Should not throw
            expect(() => targetUnregister()).not.toThrow();
          }
          
          // Verify the action is removed
          expect(engine.getAction(targetActionId)).toBeNull();
          
          // Verify other actions are still present
          const remainingActions = engine.getAllActions();
          expect(remainingActions.length).toBe(actionCount - 1);
          
          // Verify the removed action is not in the list
          expect(remainingActions.find(a => a.id === targetActionId)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should remove screen on first unregister call', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random screen ID
        fc.string({ minLength: 1, maxLength: 20 }),
        async (screenId) => {
          const { ScreenRegistry } = await import('../../src/screen-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register a screen
          const unregister = registry.registerScreen({
            id: screenId,
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          // Verify screen is registered
          expect(registry.getScreen(screenId)).not.toBeNull();
          expect(registry.getAllScreens().length).toBe(1);
          
          // Call unregister once
          unregister();
          
          // Verify screen is removed
          expect(registry.getScreen(screenId)).toBeNull();
          expect(registry.getAllScreens().length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should remove action on first unregister call', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        async (actionId) => {
          const { ActionEngine } = await import('../../src/action-engine.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          // Register an action
          const unregister = engine.registerAction({
            id: actionId,
            handler: async () => ({ success: true })
          });
          
          // Verify action is registered
          expect(engine.getAction(actionId)).not.toBeNull();
          expect(engine.getAllActions().length).toBe(1);
          
          // Call unregister once
          unregister();
          
          // Verify action is removed
          expect(engine.getAction(actionId)).toBeNull();
          expect(engine.getAllActions().length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle concurrent unregister calls for screens', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of screens (2-8)
        fc.integer({ min: 2, max: 8 }),
        async (screenCount) => {
          const { ScreenRegistry } = await import('../../src/screen-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const registry = new ScreenRegistry(logger);
          
          // Register screens and collect unregister functions
          const unregisterFunctions: Array<() => void> = [];
          
          for (let i = 0; i < screenCount; i++) {
            const unregister = registry.registerScreen({
              id: `screen-${i}`,
              title: `Screen ${i}`,
              component: `Component${i}`
            });
            
            unregisterFunctions.push(unregister);
          }
          
          // Verify all screens are registered
          expect(registry.getAllScreens().length).toBe(screenCount);
          
          // Call all unregister functions
          unregisterFunctions.forEach(unregister => {
            expect(() => unregister()).not.toThrow();
          });
          
          // Verify all screens are removed
          expect(registry.getAllScreens().length).toBe(0);
          
          // Call all unregister functions again - should still be safe
          unregisterFunctions.forEach(unregister => {
            expect(() => unregister()).not.toThrow();
          });
          
          // Verify still empty
          expect(registry.getAllScreens().length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle concurrent unregister calls for actions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of actions (2-8)
        fc.integer({ min: 2, max: 8 }),
        async (actionCount) => {
          const { ActionEngine } = await import('../../src/action-engine.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          // Register actions and collect unregister functions
          const unregisterFunctions: Array<() => void> = [];
          
          for (let i = 0; i < actionCount; i++) {
            const unregister = engine.registerAction({
              id: `action-${i}`,
              handler: async () => ({ result: i })
            });
            
            unregisterFunctions.push(unregister);
          }
          
          // Verify all actions are registered
          expect(engine.getAllActions().length).toBe(actionCount);
          
          // Call all unregister functions
          unregisterFunctions.forEach(unregister => {
            expect(() => unregister()).not.toThrow();
          });
          
          // Verify all actions are removed
          expect(engine.getAllActions().length).toBe(0);
          
          // Call all unregister functions again - should still be safe
          unregisterFunctions.forEach(unregister => {
            expect(() => unregister()).not.toThrow();
          });
          
          // Verify still empty
          expect(engine.getAllActions().length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
