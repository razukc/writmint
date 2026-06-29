import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext, ActionDefinition } from '../../src/types.js';

/**
 * Integration tests for generic action types.
 * Tests type-safe action registration and execution with generics.
 * Tests Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
describe('Generic Action Types Integration Tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('Type-safe action registration with generics', () => {
    it('should register action with typed payload and return type (Requirement 6.1, 6.2)', async () => {
      interface CreateUserPayload {
        username: string;
        email: string;
      }

      interface CreateUserResult {
        id: number;
        username: string;
        email: string;
        createdAt: Date;
      }

      const plugin: PluginDefinition = {
        name: 'user-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register action with explicit generic types
          const unregister = context.actions.registerAction<CreateUserPayload, CreateUserResult>({
            id: 'create-user',
            handler: async (params: CreateUserPayload, ctx: RuntimeContext): Promise<CreateUserResult> => {
              return {
                id: 1,
                username: params.username,
                email: params.email,
                createdAt: new Date()
              };
            }
          });

          expect(typeof unregister).toBe('function');
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Execute action with typed parameters
      const result = await context.actions.runAction<CreateUserPayload, CreateUserResult>(
        'create-user',
        { username: 'testuser', email: 'test@example.com' }
      );

      expect(result.id).toBe(1);
      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should register action with complex nested types (Requirement 6.1)', async () => {
      interface Address {
        street: string;
        city: string;
        zipCode: string;
      }

      interface UserProfile {
        name: string;
        age: number;
        addresses: Address[];
        metadata: Record<string, unknown>;
      }

      interface ProfileUpdatePayload {
        userId: number;
        profile: UserProfile;
      }

      interface ProfileUpdateResult {
        success: boolean;
        updatedProfile: UserProfile;
        timestamp: number;
      }

      const plugin: PluginDefinition = {
        name: 'profile-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<ProfileUpdatePayload, ProfileUpdateResult>({
            id: 'update-profile',
            handler: async (params: ProfileUpdatePayload): Promise<ProfileUpdateResult> => {
              return {
                success: true,
                updatedProfile: params.profile,
                timestamp: Date.now()
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const payload: ProfileUpdatePayload = {
        userId: 42,
        profile: {
          name: 'John Doe',
          age: 30,
          addresses: [
            { street: '123 Main St', city: 'Springfield', zipCode: '12345' }
          ],
          metadata: { role: 'admin', verified: true }
        }
      };

      const result = await context.actions.runAction<ProfileUpdatePayload, ProfileUpdateResult>(
        'update-profile',
        payload
      );

      expect(result.success).toBe(true);
      expect(result.updatedProfile.name).toBe('John Doe');
      expect(result.updatedProfile.addresses).toHaveLength(1);
      expect(result.updatedProfile.metadata.role).toBe('admin');
    });

    it('should register action with void return type (Requirement 6.1)', async () => {
      interface LogPayload {
        level: 'info' | 'warn' | 'error';
        message: string;
      }

      const logs: string[] = [];

      const plugin: PluginDefinition = {
        name: 'logger-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<LogPayload, void>({
            id: 'log-message',
            handler: async (params: LogPayload): Promise<void> => {
              logs.push(`[${params.level}] ${params.message}`);
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const result = await context.actions.runAction<LogPayload, void>(
        'log-message',
        { level: 'info', message: 'Test log' }
      );

      expect(result).toBeUndefined();
      expect(logs).toEqual(['[info] Test log']);
    });

    it('should register action with no parameters (Requirement 6.1)', async () => {
      interface StatusResult {
        status: 'healthy' | 'unhealthy';
        uptime: number;
      }

      const plugin: PluginDefinition = {
        name: 'health-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<void, StatusResult>({
            id: 'health-check',
            handler: async (): Promise<StatusResult> => {
              return {
                status: 'healthy',
                uptime: 12345
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const result = await context.actions.runAction<void, StatusResult>('health-check');

      expect(result.status).toBe('healthy');
      expect(result.uptime).toBe(12345);
    });

    it('should register action with union types (Requirement 6.1)', async () => {
      type OperationPayload = 
        | { type: 'add'; a: number; b: number }
        | { type: 'multiply'; a: number; b: number }
        | { type: 'negate'; value: number };

      interface OperationResult {
        operation: string;
        result: number;
      }

      const plugin: PluginDefinition = {
        name: 'math-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<OperationPayload, OperationResult>({
            id: 'calculate',
            handler: async (params: OperationPayload): Promise<OperationResult> => {
              switch (params.type) {
                case 'add':
                  return { operation: 'add', result: params.a + params.b };
                case 'multiply':
                  return { operation: 'multiply', result: params.a * params.b };
                case 'negate':
                  return { operation: 'negate', result: -params.value };
              }
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const addResult = await context.actions.runAction<OperationPayload, OperationResult>(
        'calculate',
        { type: 'add', a: 5, b: 3 }
      );
      expect(addResult.result).toBe(8);

      const multiplyResult = await context.actions.runAction<OperationPayload, OperationResult>(
        'calculate',
        { type: 'multiply', a: 4, b: 7 }
      );
      expect(multiplyResult.result).toBe(28);

      const negateResult = await context.actions.runAction<OperationPayload, OperationResult>(
        'calculate',
        { type: 'negate', value: 10 }
      );
      expect(negateResult.result).toBe(-10);
    });
  });

  describe('Type-safe action execution with generics', () => {
    it('should execute action with correct type inference (Requirement 6.3)', async () => {
      interface SearchPayload {
        query: string;
        filters: Record<string, string>;
      }

      interface SearchResult {
        items: Array<{ id: string; title: string }>;
        total: number;
      }

      const plugin: PluginDefinition = {
        name: 'search-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<SearchPayload, SearchResult>({
            id: 'search',
            handler: async (params: SearchPayload): Promise<SearchResult> => {
              return {
                items: [
                  { id: '1', title: `Result for ${params.query}` }
                ],
                total: 1
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Type inference should work correctly
      const result = await context.actions.runAction<SearchPayload, SearchResult>(
        'search',
        { query: 'test', filters: { category: 'docs' } }
      );

      // TypeScript should infer result type correctly
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Result for test');
      expect(result.total).toBe(1);
    });

    it('should handle synchronous action handlers with generics (Requirement 6.3)', async () => {
      interface CountPayload {
        items: unknown[];
      }

      const plugin: PluginDefinition = {
        name: 'count-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<CountPayload, number>({
            id: 'count-items',
            handler: (params: CountPayload): number => {
              return params.items.length;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const result = await context.actions.runAction<CountPayload, number>(
        'count-items',
        { items: [1, 2, 3, 4, 5] }
      );

      expect(result).toBe(5);
    });

    it('should handle action that returns Promise directly (Requirement 6.3)', async () => {
      interface DelayedPayload {
        delayMs: number;
        value: string;
      }

      const plugin: PluginDefinition = {
        name: 'delay-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<DelayedPayload, string>({
            id: 'delayed-action',
            handler: (params: DelayedPayload): Promise<string> => {
              return new Promise((resolve) => {
                setTimeout(() => resolve(params.value), params.delayMs);
              });
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const startTime = Date.now();
      const result = await context.actions.runAction<DelayedPayload, string>(
        'delayed-action',
        { delayMs: 50, value: 'delayed-result' }
      );
      const elapsed = Date.now() - startTime;

      expect(result).toBe('delayed-result');
      // setTimeout/Date.now can report a hair under the requested delay (timer
      // and clock resolution differ across platforms), so allow a small underrun.
      // The resolved value above already proves the Promise was awaited; this
      // assertion only confirms a real asynchronous delay occurred.
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should handle multiple actions with different generic types (Requirement 6.3)', async () => {
      interface StringPayload { value: string; }
      interface NumberPayload { value: number; }
      interface BooleanPayload { value: boolean; }

      const plugin: PluginDefinition = {
        name: 'multi-type-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<StringPayload, string>({
            id: 'process-string',
            handler: async (params: StringPayload): Promise<string> => {
              return params.value.toUpperCase();
            }
          });

          context.actions.registerAction<NumberPayload, number>({
            id: 'process-number',
            handler: async (params: NumberPayload): Promise<number> => {
              return params.value * 2;
            }
          });

          context.actions.registerAction<BooleanPayload, boolean>({
            id: 'process-boolean',
            handler: async (params: BooleanPayload): Promise<boolean> => {
              return !params.value;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const stringResult = await context.actions.runAction<StringPayload, string>(
        'process-string',
        { value: 'hello' }
      );
      expect(stringResult).toBe('HELLO');

      const numberResult = await context.actions.runAction<NumberPayload, number>(
        'process-number',
        { value: 21 }
      );
      expect(numberResult).toBe(42);

      const booleanResult = await context.actions.runAction<BooleanPayload, boolean>(
        'process-boolean',
        { value: true }
      );
      expect(booleanResult).toBe(false);
    });
  });

  describe('Backward compatibility with unknown types', () => {
    it('should work without explicit generic types (Requirement 6.5)', async () => {
      const plugin: PluginDefinition = {
        name: 'legacy-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register action without generic types (defaults to unknown)
          context.actions.registerAction({
            id: 'legacy-action',
            handler: async (params: unknown): Promise<unknown> => {
              return { result: 'legacy', params };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Execute without generic types
      const result = await context.actions.runAction('legacy-action', { test: 'data' });

      expect(result).toEqual({ result: 'legacy', params: { test: 'data' } });
    });

    it('should allow mixing typed and untyped actions (Requirement 6.5)', async () => {
      interface TypedPayload { value: number; }

      const plugin: PluginDefinition = {
        name: 'mixed-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Typed action
          context.actions.registerAction<TypedPayload, number>({
            id: 'typed-action',
            handler: async (params: TypedPayload): Promise<number> => {
              return params.value * 2;
            }
          });

          // Untyped action
          context.actions.registerAction({
            id: 'untyped-action',
            handler: async (params: unknown): Promise<unknown> => {
              return { received: params };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const typedResult = await context.actions.runAction<TypedPayload, number>(
        'typed-action',
        { value: 10 }
      );
      expect(typedResult).toBe(20);

      const untypedResult = await context.actions.runAction('untyped-action', 'anything');
      expect(untypedResult).toEqual({ received: 'anything' });
    });
  });

  describe('Generic types with RuntimeContext access', () => {
    it('should allow typed action to access RuntimeContext (Requirement 6.2, 6.3)', async () => {
      interface CreateTaskPayload {
        title: string;
        description: string;
      }

      interface Task {
        id: string;
        title: string;
        description: string;
        createdBy: string;
      }

      const plugin: PluginDefinition = {
        name: 'task-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register a screen that the action will reference
          context.screens.registerScreen({
            id: 'task-list',
            title: 'Task List',
            component: 'TaskListComponent'
          });

          // Register typed action that uses RuntimeContext
          context.actions.registerAction<CreateTaskPayload, Task>({
            id: 'create-task',
            handler: async (params: CreateTaskPayload, ctx: RuntimeContext): Promise<Task> => {
              // Access screens through context
              const screen = ctx.screens.getScreen('task-list');
              
              // Emit event through context
              ctx.events.emit('task:created', { title: params.title });
              
              return {
                id: `task-${Date.now()}`,
                title: params.title,
                description: params.description,
                createdBy: screen?.title || 'unknown'
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const task = await context.actions.runAction<CreateTaskPayload, Task>(
        'create-task',
        { title: 'Test Task', description: 'Test Description' }
      );

      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.createdBy).toBe('Task List');
      expect(task.id).toMatch(/^task-\d+$/);
    });

    it('should allow typed action to call other typed actions (Requirement 6.3)', async () => {
      interface ValidatePayload { value: string; }
      interface ProcessPayload { data: string; }
      interface ProcessResult { validated: boolean; processed: string; }

      const plugin: PluginDefinition = {
        name: 'pipeline-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // First action: validation
          context.actions.registerAction<ValidatePayload, boolean>({
            id: 'validate',
            handler: async (params: ValidatePayload): Promise<boolean> => {
              return params.value.length > 0;
            }
          });

          // Second action: processing that calls validation
          context.actions.registerAction<ProcessPayload, ProcessResult>({
            id: 'process',
            handler: async (params: ProcessPayload, ctx: RuntimeContext): Promise<ProcessResult> => {
              const isValid = await ctx.actions.runAction<ValidatePayload, boolean>(
                'validate',
                { value: params.data }
              );
              
              return {
                validated: isValid,
                processed: isValid ? params.data.toUpperCase() : ''
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      const result = await context.actions.runAction<ProcessPayload, ProcessResult>(
        'process',
        { data: 'test' }
      );

      expect(result.validated).toBe(true);
      expect(result.processed).toBe('TEST');
    });
  });

  describe('Generic types with action timeout', () => {
    it('should support timeout with generic types (Requirement 6.1, 11.1)', async () => {
      interface SlowPayload { duration: number; }

      const plugin: PluginDefinition = {
        name: 'timeout-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction<SlowPayload, string>({
            id: 'slow-action',
            timeout: 100,
            handler: async (params: SlowPayload): Promise<string> => {
              await new Promise(resolve => setTimeout(resolve, params.duration));
              return 'completed';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Should complete within timeout
      const result = await context.actions.runAction<SlowPayload, string>(
        'slow-action',
        { duration: 50 }
      );
      expect(result).toBe('completed');

      // Should timeout
      await expect(
        context.actions.runAction<SlowPayload, string>(
          'slow-action',
          { duration: 200 }
        )
      ).rejects.toThrow(/\[action\.timeout\].*100ms/);
    });
  });

  describe('Generic types with unregister function', () => {
    it('should return unregister function for typed actions (Requirement 4.1, 6.2)', async () => {
      interface TestPayload { value: string; }
      let unregisterFn: (() => void) | null = null;

      const plugin: PluginDefinition = {
        name: 'unregister-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          unregisterFn = context.actions.registerAction<TestPayload, string>({
            id: 'test-action',
            handler: async (params: TestPayload): Promise<string> => {
              return params.value;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Action should work
      const result1 = await context.actions.runAction<TestPayload, string>(
        'test-action',
        { value: 'test' }
      );
      expect(result1).toBe('test');

      // Unregister the action
      expect(unregisterFn).not.toBeNull();
      unregisterFn!();

      // Action should no longer exist
      await expect(
        context.actions.runAction<TestPayload, string>('test-action', { value: 'test' })
      ).rejects.toThrow('Action "test-action" not found');
    });
  });
});
