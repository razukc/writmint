import { describe, it, expect } from 'vitest';
import { ActionEngine } from '../../src/action-engine.js';
import type { ActionDefinition, RuntimeContext, Logger } from '../../src/types.js';
import { ValidationError, DuplicateRegistrationError, ActionTimeoutError, ActionExecutionError } from '../../src/types.js';

// Create a minimal mock logger for testing
function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}

// Create a minimal mock RuntimeContext for testing
function createMockContext(): RuntimeContext {
  return {
    screens: {
      registerScreen: () => () => {},
      getScreen: () => null,
      getAllScreens: () => []
    },
    actions: {
      registerAction: () => () => {},
      runAction: async () => undefined as any
    },
    plugins: {
      registerPlugin: () => {},
      getPlugin: () => null,
      getAllPlugins: () => [],
      getInitializedPlugins: () => []
    },
    events: {
      emit: () => {},
      emitAsync: async () => {},
      on: () => () => {}
    },
    getRuntime: () => ({
      initialize: async () => {},
      shutdown: async () => {},
      getContext: () => createMockContext()
    })
  };
}

describe('ActionEngine', () => {
  describe('registerAction', () => {
    it('should register a valid action definition', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      expect(() => engine.registerAction(action)).not.toThrow();
      
      const retrieved = engine.getAction('test-action');
      expect(retrieved).toEqual(action);
    });

    it('should reject duplicate action IDs with DuplicateRegistrationError', () => {
      const engine = new ActionEngine(createMockLogger());
      const action1: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result1'
      };
      const action2: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result2'
      };
      
      engine.registerAction(action1);
      
      expect(() => engine.registerAction(action2)).toThrow(DuplicateRegistrationError);
      expect(() => engine.registerAction(action2)).toThrow(
        /\[validation\.duplicate_id\].*Action\[test-action\]/
      );
    });

    it('should validate required id field with ValidationError', () => {
      const engine = new ActionEngine(createMockLogger());
      const actionWithoutId = {
        handler: () => 'result'
      } as unknown as ActionDefinition;
      
      expect(() => engine.registerAction(actionWithoutId)).toThrow(ValidationError);
      expect(() => engine.registerAction(actionWithoutId)).toThrow(
        /\[validation\.invalid_field\].*Action.*\.id/
      );
    });

    it('should validate required handler field with ValidationError', () => {
      const engine = new ActionEngine(createMockLogger());
      const actionWithoutHandler = {
        id: 'test-action'
      } as unknown as ActionDefinition;
      
      expect(() => engine.registerAction(actionWithoutHandler)).toThrow(ValidationError);
      expect(() => engine.registerAction(actionWithoutHandler)).toThrow(
        /\[validation\.invalid_field\].*\.handler/
      );
    });

    it('should reject action with empty id', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: '',
        handler: () => 'result'
      };
      
      expect(() => engine.registerAction(action)).toThrow(ValidationError);
    });

    it('should reject action with non-string id', () => {
      const engine = new ActionEngine(createMockLogger());
      const action = {
        id: 123,
        handler: () => 'result'
      } as unknown as ActionDefinition;
      
      expect(() => engine.registerAction(action)).toThrow(ValidationError);
    });

    it('should reject action with non-function handler', () => {
      const engine = new ActionEngine(createMockLogger());
      const action = {
        id: 'test-action',
        handler: 'not-a-function'
      } as unknown as ActionDefinition;
      
      expect(() => engine.registerAction(action)).toThrow(ValidationError);
    });

    it('should return unregister function', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      const unregister = engine.registerAction(action);
      
      expect(typeof unregister).toBe('function');
      expect(engine.getAction('test-action')).toEqual(action);
      
      unregister();
      
      expect(engine.getAction('test-action')).toBeNull();
    });

    it('should make unregister function idempotent', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      const unregister = engine.registerAction(action);
      
      unregister();
      unregister();
      unregister();
      
      expect(engine.getAction('test-action')).toBeNull();
    });
  });

  describe('runAction', () => {
    it('should execute handler with params and context', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      let receivedParams: unknown;
      let receivedContext: RuntimeContext | undefined;
      
      const action: ActionDefinition = {
        id: 'test-action',
        handler: (params, context) => {
          receivedParams = params;
          receivedContext = context;
          return 'success';
        }
      };
      
      engine.registerAction(action);
      
      const params = { key: 'value' };
      const result = await engine.runAction('test-action', params);
      
      expect(result).toBe('success');
      expect(receivedParams).toEqual(params);
      expect(receivedContext).toBe(mockContext);
    });

    it('should throw error for non-existent action', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      await expect(engine.runAction('non-existent')).rejects.toThrow(
        'Action "non-existent" not found'
      );
    });

    it('should provide helpful error message for namespaced actions', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      await expect(engine.runAction('auth:login')).rejects.toThrow(
        'Action "auth:login" not found. If this action belongs to plugin "auth", ensure the plugin is initialized and "auth" is listed in the dependencies array of the calling plugin.'
      );
    });

    it('should handle synchronous handlers', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const action: ActionDefinition = {
        id: 'sync-action',
        handler: () => 'sync-result'
      };
      
      engine.registerAction(action);
      
      const result = await engine.runAction('sync-action');
      
      expect(result).toBe('sync-result');
    });

    it('should handle asynchronous handlers', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const action: ActionDefinition = {
        id: 'async-action',
        handler: async () => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'async-result';
        }
      };
      
      engine.registerAction(action);
      
      const result = await engine.runAction('async-action');
      
      expect(result).toBe('async-result');
    });

    it('should handle actions without params', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      let receivedParams: unknown;
      
      const action: ActionDefinition = {
        id: 'no-params-action',
        handler: (params) => {
          receivedParams = params;
          return 'result';
        }
      };
      
      engine.registerAction(action);
      
      const result = await engine.runAction('no-params-action');
      
      expect(result).toBe('result');
      expect(receivedParams).toBeUndefined();
    });

    it('should throw error if context is not set', async () => {
      const engine = new ActionEngine(createMockLogger());
      
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      engine.registerAction(action);
      
      await expect(engine.runAction('test-action')).rejects.toThrow(
        'RuntimeContext not set in ActionEngine'
      );
    });

    it('should return handler result', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const expectedResult = { data: 'test', count: 42 };
      
      const action: ActionDefinition = {
        id: 'result-action',
        handler: () => expectedResult
      };
      
      engine.registerAction(action);
      
      const result = await engine.runAction('result-action');
      
      expect(result).toEqual(expectedResult);
    });

    it('should wrap handler errors in ActionExecutionError', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const originalError = new Error('Handler failed');
      const action: ActionDefinition = {
        id: 'failing-action',
        handler: () => {
          throw originalError;
        }
      };
      
      engine.registerAction(action);
      
      await expect(engine.runAction('failing-action')).rejects.toThrow(ActionExecutionError);
      
      try {
        await engine.runAction('failing-action');
      } catch (error) {
        expect(error).toBeInstanceOf(ActionExecutionError);
        if (error instanceof ActionExecutionError) {
          expect(error.actionId).toBe('failing-action');
          expect(error.cause).toBe(originalError);
          expect(error.message).toContain('failing-action');
          expect(error.message).toContain('Handler failed');
        }
      }
    });

    it('should enforce timeout when specified', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const action: ActionDefinition = {
        id: 'slow-action',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'result';
        },
        timeout: 50
      };
      
      engine.registerAction(action);
      
      await expect(engine.runAction('slow-action')).rejects.toThrow(ActionTimeoutError);
      
      try {
        await engine.runAction('slow-action');
      } catch (error) {
        expect(error).toBeInstanceOf(ActionTimeoutError);
        if (error instanceof ActionTimeoutError) {
          expect(error.actionId).toBe('slow-action');
          expect(error.timeoutMs).toBe(50);
        }
      }
    });

    it('should not timeout when action completes within timeout', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const action: ActionDefinition = {
        id: 'fast-action',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'result';
        },
        timeout: 100
      };
      
      engine.registerAction(action);
      
      const result = await engine.runAction('fast-action');
      expect(result).toBe('result');
    });

    it('should not wrap ActionTimeoutError', async () => {
      const engine = new ActionEngine(createMockLogger());
      const mockContext = createMockContext();
      engine.setContext(mockContext);
      
      const action: ActionDefinition = {
        id: 'timeout-action',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'result';
        },
        timeout: 50
      };
      
      engine.registerAction(action);
      
      try {
        await engine.runAction('timeout-action');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ActionTimeoutError);
        expect(error).not.toBeInstanceOf(ActionExecutionError);
      }
    });
  });

  describe('getAction', () => {
    it('should return action definition for existing ID', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      engine.registerAction(action);
      const retrieved = engine.getAction('test-action');
      
      expect(retrieved).toEqual(action);
    });

    it('should return null for non-existing ID', () => {
      const engine = new ActionEngine(createMockLogger());
      
      const retrieved = engine.getAction('non-existent');
      
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllActions', () => {
    it('should return all registered actions', () => {
      const engine = new ActionEngine(createMockLogger());
      const action1: ActionDefinition = {
        id: 'action1',
        handler: () => 'result1'
      };
      const action2: ActionDefinition = {
        id: 'action2',
        handler: () => 'result2'
      };
      const action3: ActionDefinition = {
        id: 'action3',
        handler: () => 'result3'
      };
      
      engine.registerAction(action1);
      engine.registerAction(action2);
      engine.registerAction(action3);
      
      const allActions = engine.getAllActions();
      
      expect(allActions).toHaveLength(3);
      expect(allActions).toContainEqual(action1);
      expect(allActions).toContainEqual(action2);
      expect(allActions).toContainEqual(action3);
    });

    it('should return empty array when no actions are registered', () => {
      const engine = new ActionEngine(createMockLogger());
      
      const allActions = engine.getAllActions();
      
      expect(allActions).toEqual([]);
    });

    it('should return a copy that does not affect internal state', () => {
      const engine = new ActionEngine(createMockLogger());
      const action: ActionDefinition = {
        id: 'test-action',
        handler: () => 'result'
      };
      
      engine.registerAction(action);
      
      const allActions = engine.getAllActions();
      allActions.push({
        id: 'fake-action',
        handler: () => 'fake'
      });
      
      expect(engine.getAllActions()).toHaveLength(1);
      expect(engine.getAction('fake-action')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all registered actions', () => {
      const engine = new ActionEngine(createMockLogger());
      const action1: ActionDefinition = {
        id: 'action1',
        handler: () => 'result1'
      };
      const action2: ActionDefinition = {
        id: 'action2',
        handler: () => 'result2'
      };
      
      engine.registerAction(action1);
      engine.registerAction(action2);
      
      engine.clear();
      
      expect(engine.getAction('action1')).toBeNull();
      expect(engine.getAction('action2')).toBeNull();
      expect(engine.getAllActions()).toEqual([]);
    });

    it('should allow registering actions after clear', () => {
      const engine = new ActionEngine(createMockLogger());
      const action1: ActionDefinition = {
        id: 'action1',
        handler: () => 'result1'
      };
      const action2: ActionDefinition = {
        id: 'action1',
        handler: () => 'result2'
      };
      
      engine.registerAction(action1);
      engine.clear();
      
      // Should not throw since previous action was cleared
      expect(() => engine.registerAction(action2)).not.toThrow();
      expect(engine.getAction('action1')).toEqual(action2);
    });
  });

  describe('instance isolation', () => {
    it('should maintain separate registries for different ActionEngine instances', () => {
      const engine1 = new ActionEngine(createMockLogger());
      const engine2 = new ActionEngine(createMockLogger());
      
      const action1: ActionDefinition = {
        id: 'action1',
        handler: () => 'result1'
      };
      const action2: ActionDefinition = {
        id: 'action1',
        handler: () => 'result2'
      };
      
      engine1.registerAction(action1);
      engine2.registerAction(action2);
      
      expect(engine1.getAction('action1')).toEqual(action1);
      expect(engine2.getAction('action1')).toEqual(action2);
      expect(engine1.getAllActions()).toHaveLength(1);
      expect(engine2.getAllActions()).toHaveLength(1);
    });
  });
});
