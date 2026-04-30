import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ActionEngine } from '../../src/action-engine.js';
import { ConsoleLogger, ActionTimeoutError } from '../../src/types.js';

/**
 * Property 6: Timeout Enforcement
 * 
 * Feature: runtime-hardening, Property 6: Timeout Enforcement
 * 
 * For any action with a timeout, if execution exceeds the timeout duration,
 * an ActionTimeoutError should be thrown
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */
describe('Property 6: Timeout Enforcement', () => {
  it('should throw ActionTimeoutError when action exceeds timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random timeout (50-150ms)
        fc.integer({ min: 50, max: 150 }),
        // Generate random delay that exceeds timeout (50-100ms extra)
        fc.integer({ min: 50, max: 100 }),
        async (actionId, timeout, extraDelay) => {
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          const handlerDelay = timeout + extraDelay;
          
          // Register action with timeout and handler that exceeds it
          engine.registerAction({
            id: actionId,
            handler: async () => {
              await new Promise(resolve => setTimeout(resolve, handlerDelay));
              return { success: true };
            },
            timeout
          });
          
          // Run the action and expect timeout error
          try {
            await engine.runAction(actionId);
            // Should not reach here
            expect.fail('Expected ActionTimeoutError to be thrown');
          } catch (error) {
            // Verify it's an ActionTimeoutError
            expect(error).toBeInstanceOf(ActionTimeoutError);
            
            // Verify error includes correct action ID
            expect((error as ActionTimeoutError).actionId).toBe(actionId);
            
            // Verify error includes correct timeout value
            expect((error as ActionTimeoutError).timeoutMs).toBe(timeout);
            
            // Verify error message includes action ID and timeout
            expect((error as Error).message).toContain(actionId);
            expect((error as Error).message).toContain(timeout.toString());
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000); // 30 second timeout for this test

  it('should complete successfully when action finishes before timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random timeout (100-300ms)
        fc.integer({ min: 100, max: 300 }),
        // Generate random delay that is less than timeout (10-50ms)
        fc.integer({ min: 10, max: 50 }),
        async (actionId, timeout, handlerDelay) => {
          fc.pre(handlerDelay < timeout);
          
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          const expectedResult = { success: true, value: Math.random() };
          
          // Register action with timeout and handler that completes in time
          engine.registerAction({
            id: actionId,
            handler: async () => {
              await new Promise(resolve => setTimeout(resolve, handlerDelay));
              return expectedResult;
            },
            timeout
          });
          
          // Run the action and expect successful completion
          const result = await engine.runAction(actionId);
          
          // Verify result is returned correctly
          expect(result).toEqual(expectedResult);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow actions without timeout to run indefinitely', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random delay (20-100ms)
        fc.integer({ min: 20, max: 100 }),
        async (actionId, handlerDelay) => {
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          const expectedResult = { success: true, delay: handlerDelay };
          
          // Register action WITHOUT timeout
          engine.registerAction({
            id: actionId,
            handler: async () => {
              await new Promise(resolve => setTimeout(resolve, handlerDelay));
              return expectedResult;
            }
            // No timeout specified
          });
          
          // Run the action and expect successful completion
          const result = await engine.runAction(actionId);
          
          // Verify result is returned correctly
          expect(result).toEqual(expectedResult);
        }
      ),
      { numRuns: 50 }
    );
  }, 20000); // 20 second timeout for this test

  it('should throw ActionTimeoutError with distinguishable properties', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random timeout (50-100ms)
        fc.integer({ min: 50, max: 100 }),
        async (actionId, timeout) => {
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          // Register action with timeout and handler that exceeds it
          engine.registerAction({
            id: actionId,
            handler: async () => {
              await new Promise(resolve => setTimeout(resolve, timeout + 80));
              return { success: true };
            },
            timeout
          });
          
          // Run the action and expect timeout error
          try {
            await engine.runAction(actionId);
            expect.fail('Expected ActionTimeoutError to be thrown');
          } catch (error) {
            // Verify error name is ActionTimeoutError
            expect((error as Error).name).toBe('ActionTimeoutError');
            
            // Verify error is distinguishable from other errors
            expect(error).toBeInstanceOf(ActionTimeoutError);
            expect(error).toBeInstanceOf(Error); // ActionTimeoutError extends Error
            
            // Verify error has required properties
            expect((error as ActionTimeoutError)).toHaveProperty('actionId');
            expect((error as ActionTimeoutError)).toHaveProperty('timeoutMs');
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 20000); // 20 second timeout for this test

  it('should handle multiple actions with different timeouts independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of actions (2-3)
        fc.integer({ min: 2, max: 3 }),
        async (actionCount) => {
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          const actions: Array<{ id: string; timeout: number; delay: number; shouldTimeout: boolean }> = [];
          
          // Register multiple actions with different timeouts
          for (let i = 0; i < actionCount; i++) {
            const actionId = `action-${i}`;
            const timeout = 50 + (i * 30); // 50, 80, 110, etc.
            const shouldTimeout = i % 2 === 0; // Alternate between timeout and success
            const delay = shouldTimeout ? timeout + 50 : timeout - 20;
            
            actions.push({ id: actionId, timeout, delay, shouldTimeout });
            
            engine.registerAction({
              id: actionId,
              handler: async () => {
                await new Promise(resolve => setTimeout(resolve, delay));
                return { success: true, index: i };
              },
              timeout
            });
          }
          
          // Run all actions and verify behavior
          for (const action of actions) {
            if (action.shouldTimeout) {
              // Expect timeout error
              try {
                await engine.runAction(action.id);
                expect.fail(`Expected ActionTimeoutError for ${action.id}`);
              } catch (error) {
                expect(error).toBeInstanceOf(ActionTimeoutError);
                expect((error as ActionTimeoutError).actionId).toBe(action.id);
              }
            } else {
              // Expect successful completion
              const result = await engine.runAction(action.id);
              expect(result).toHaveProperty('success', true);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000); // 30 second timeout for this test

  it('should clear timeout when action completes successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random timeout (100-200ms)
        fc.integer({ min: 100, max: 200 }),
        // Generate random delay that is less than timeout (20-50ms)
        fc.integer({ min: 20, max: 50 }),
        async (actionId, timeout, handlerDelay) => {
          fc.pre(handlerDelay < timeout);
          
          const logger = new ConsoleLogger();
          const engine = new ActionEngine(logger);
          
          // Set a mock context
          const mockContext = {} as any;
          engine.setContext(mockContext);
          
          let handlerCompleted = false;
          
          // Register action with timeout
          engine.registerAction({
            id: actionId,
            handler: async () => {
              await new Promise(resolve => setTimeout(resolve, handlerDelay));
              handlerCompleted = true;
              return { success: true };
            },
            timeout
          });
          
          // Run the action
          const result = await engine.runAction(actionId);
          
          // Verify handler completed
          expect(handlerCompleted).toBe(true);
          expect(result).toEqual({ success: true });
          
          // Wait a bit longer to ensure no delayed timeout error
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // If we reach here without error, timeout was properly cleared
          expect(handlerCompleted).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000); // 30 second timeout for this test
});
