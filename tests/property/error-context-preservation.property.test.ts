import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ActionEngine } from '../../src/action-engine.js';
import { ConsoleLogger, ActionExecutionError, ActionTimeoutError } from '../../src/types.js';

/**
 * Property 7: Error Context Preservation
 * 
 * Feature: runtime-hardening, Property 7: Error Context Preservation
 * 
 * For any action handler that throws an error, the error should be wrapped
 * in an ActionExecutionError that includes the action ID and original error
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
describe('Property 7: Error Context Preservation', () => {
  it('should wrap handler errors in ActionExecutionError with action ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random error message
        fc.string({ minLength: 1, maxLength: 50 }),
        async (actionId, errorMessage) => {
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Register action that throws an error
          actionEngine.registerAction({
            id: actionId,
            handler: () => {
              throw new Error(errorMessage);
            }
          });
          
          // Execute action and capture error
          let thrownError: Error | null = null;
          try {
            await actionEngine.runAction(actionId);
          } catch (error) {
            thrownError = error as Error;
          }
          
          // Verify error is wrapped in ActionExecutionError
          expect(thrownError).not.toBeNull();
          expect(thrownError).toBeInstanceOf(ActionExecutionError);
          
          // Verify wrapped error includes action ID
          const executionError = thrownError as ActionExecutionError;
          expect(executionError.actionId).toBe(actionId);
          
          // Verify original error is preserved as cause
          expect(executionError.cause).toBeInstanceOf(Error);
          expect((executionError.cause as Error).message).toBe(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve original error type and properties in cause', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random error properties
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 50 }),
          code: fc.integer({ min: 100, max: 999 }),
          details: fc.string({ minLength: 1, maxLength: 30 })
        }),
        async (actionId, errorProps) => {
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Create custom error with properties
          class CustomError extends Error {
            code: number;
            details: string;
            
            constructor(message: string, code: number, details: string) {
              super(message);
              this.name = 'CustomError';
              this.code = code;
              this.details = details;
            }
          }
          
          // Register action that throws custom error
          actionEngine.registerAction({
            id: actionId,
            handler: () => {
              throw new CustomError(errorProps.message, errorProps.code, errorProps.details);
            }
          });
          
          // Execute action and capture error
          let thrownError: ActionExecutionError | null = null;
          try {
            await actionEngine.runAction(actionId);
          } catch (error) {
            thrownError = error as ActionExecutionError;
          }
          
          // Verify error is wrapped
          expect(thrownError).not.toBeNull();
          expect(thrownError).toBeInstanceOf(ActionExecutionError);
          
          // Verify original error properties are preserved
          const originalError = thrownError!.cause as CustomError;
          expect(originalError).toBeInstanceOf(CustomError);
          expect(originalError.message).toBe(errorProps.message);
          expect(originalError.code).toBe(errorProps.code);
          expect(originalError.details).toBe(errorProps.details);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include action ID in error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random error message
        fc.string({ minLength: 1, maxLength: 50 }),
        async (actionId, errorMessage) => {
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Register action that throws an error
          actionEngine.registerAction({
            id: actionId,
            handler: () => {
              throw new Error(errorMessage);
            }
          });
          
          // Execute action and capture error
          let thrownError: ActionExecutionError | null = null;
          try {
            await actionEngine.runAction(actionId);
          } catch (error) {
            thrownError = error as ActionExecutionError;
          }
          
          // Verify error message includes action ID
          expect(thrownError).not.toBeNull();
          expect(thrownError!.message).toContain(actionId);
          
          // Verify error message includes original error message
          expect(thrownError!.message).toContain(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not wrap ActionTimeoutError in ActionExecutionError', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random timeout (10-50ms for faster tests)
        fc.integer({ min: 10, max: 50 }),
        async (actionId, timeout) => {
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Register action with timeout that will exceed it
          actionEngine.registerAction({
            id: actionId,
            timeout: timeout,
            handler: async () => {
              // Wait longer than timeout
              await new Promise(resolve => setTimeout(resolve, timeout + 20));
              return 'should not reach here';
            }
          });
          
          // Execute action and capture error
          let thrownError: Error | null = null;
          try {
            await actionEngine.runAction(actionId);
          } catch (error) {
            thrownError = error as Error;
          }
          
          // Verify error is ActionTimeoutError, not wrapped in ActionExecutionError
          expect(thrownError).not.toBeNull();
          expect(thrownError).toBeInstanceOf(ActionTimeoutError);
          expect(thrownError).not.toBeInstanceOf(ActionExecutionError);
          
          // Verify timeout error has correct properties
          const timeoutError = thrownError as ActionTimeoutError;
          expect(timeoutError.actionId).toBe(actionId);
          expect(timeoutError.timeoutMs).toBe(timeout);
        }
      ),
      { numRuns: 100 }
    );
  }, 10000); // Increase test timeout to 10 seconds

  it('should wrap errors from both sync and async handlers', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action IDs
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random error message
        fc.string({ minLength: 1, maxLength: 50 }),
        async (syncActionId, asyncActionId, errorMessage) => {
          // Ensure action IDs are different
          fc.pre(syncActionId !== asyncActionId);
          
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Register synchronous action that throws
          actionEngine.registerAction({
            id: syncActionId,
            handler: () => {
              throw new Error(errorMessage);
            }
          });
          
          // Register asynchronous action that throws
          actionEngine.registerAction({
            id: asyncActionId,
            handler: async () => {
              throw new Error(errorMessage);
            }
          });
          
          // Test synchronous handler
          let syncError: ActionExecutionError | null = null;
          try {
            await actionEngine.runAction(syncActionId);
          } catch (error) {
            syncError = error as ActionExecutionError;
          }
          
          // Test asynchronous handler
          let asyncError: ActionExecutionError | null = null;
          try {
            await actionEngine.runAction(asyncActionId);
          } catch (error) {
            asyncError = error as ActionExecutionError;
          }
          
          // Verify both errors are wrapped correctly
          expect(syncError).toBeInstanceOf(ActionExecutionError);
          expect(syncError!.actionId).toBe(syncActionId);
          expect((syncError!.cause as Error).message).toBe(errorMessage);
          
          expect(asyncError).toBeInstanceOf(ActionExecutionError);
          expect(asyncError!.actionId).toBe(asyncActionId);
          expect((asyncError!.cause as Error).message).toBe(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should wrap errors with various error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random action ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate random error type
        fc.constantFrom('Error', 'TypeError', 'RangeError', 'ReferenceError'),
        // Generate random error message
        fc.string({ minLength: 1, maxLength: 50 }),
        async (actionId, errorType, errorMessage) => {
          const logger = new ConsoleLogger();
          const actionEngine = new ActionEngine(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          actionEngine.setContext(mockContext);
          
          // Register action that throws specific error type
          actionEngine.registerAction({
            id: actionId,
            handler: () => {
              switch (errorType) {
                case 'TypeError':
                  throw new TypeError(errorMessage);
                case 'RangeError':
                  throw new RangeError(errorMessage);
                case 'ReferenceError':
                  throw new ReferenceError(errorMessage);
                default:
                  throw new Error(errorMessage);
              }
            }
          });
          
          // Execute action and capture error
          let thrownError: ActionExecutionError | null = null;
          try {
            await actionEngine.runAction(actionId);
          } catch (error) {
            thrownError = error as ActionExecutionError;
          }
          
          // Verify error is wrapped
          expect(thrownError).toBeInstanceOf(ActionExecutionError);
          expect(thrownError!.actionId).toBe(actionId);
          
          // Verify original error type is preserved
          const originalError = thrownError!.cause as Error;
          expect(originalError.message).toBe(errorMessage);
          
          // Verify error type matches
          switch (errorType) {
            case 'TypeError':
              expect(originalError).toBeInstanceOf(TypeError);
              break;
            case 'RangeError':
              expect(originalError).toBeInstanceOf(RangeError);
              break;
            case 'ReferenceError':
              expect(originalError).toBeInstanceOf(ReferenceError);
              break;
            default:
              expect(originalError).toBeInstanceOf(Error);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
