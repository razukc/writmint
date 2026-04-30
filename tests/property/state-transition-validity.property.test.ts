import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Runtime } from '../../src/runtime.js';
import { RuntimeState, ConsoleLogger } from '../../src/types.js';
import type { PluginDefinition } from '../../src/types.js';

/**
 * Property 8: State Transition Validity
 * 
 * Feature: runtime-hardening, Property 8: State Transition Validity
 * 
 * For any runtime instance, state transitions should follow the valid sequence:
 * uninitialized → initializing → initialized → shutting_down → shutdown
 * 
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */
describe('Property 8: State Transition Validity', () => {
  it('should follow valid state sequence during successful initialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of plugins (1-5) - need at least 1 to observe Initializing state
        fc.integer({ min: 1, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // Initial state should be Uninitialized
          expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
          expect(runtime.isInitialized()).toBe(false);
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {
                // During setup, state should be Initializing
                expect(runtime.getState()).toBe(RuntimeState.Initializing);
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize
          await runtime.initialize();
          
          // After initialization, state should be Initialized
          expect(runtime.getState()).toBe(RuntimeState.Initialized);
          expect(runtime.isInitialized()).toBe(true);
          
          // Cleanup
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should follow valid state sequence during shutdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of plugins (1-5) - need at least 1 to observe ShuttingDown state
        fc.integer({ min: 1, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // Register plugins with dispose callbacks
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {},
              dispose: async () => {
                // During dispose, state should be ShuttingDown
                expect(runtime.getState()).toBe(RuntimeState.ShuttingDown);
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize
          await runtime.initialize();
          expect(runtime.getState()).toBe(RuntimeState.Initialized);
          
          // Shutdown
          await runtime.shutdown();
          
          // After shutdown, state should be Shutdown
          expect(runtime.getState()).toBe(RuntimeState.Shutdown);
          expect(runtime.isInitialized()).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reset to Uninitialized when initialization fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of successful plugins before failure (0-3)
        fc.integer({ min: 0, max: 3 }),
        // Generate random error message
        fc.string({ minLength: 1, maxLength: 50 }),
        async (successfulPlugins, errorMessage) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // Initial state
          expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
          
          // Register successful plugins
          for (let i = 0; i < successfulPlugins; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {}
            };
            runtime.registerPlugin(plugin);
          }
          
          // Register a failing plugin
          const failingPlugin: PluginDefinition = {
            name: 'failing-plugin',
            version: '1.0.0',
            setup: async () => {
              throw new Error(errorMessage);
            }
          };
          runtime.registerPlugin(failingPlugin);
          
          // Try to initialize - should fail
          await expect(runtime.initialize()).rejects.toThrow();
          
          // State should be reset to Uninitialized after failure
          expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
          expect(runtime.isInitialized()).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should prevent double initialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        async (pluginCount) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {}
            };
            runtime.registerPlugin(plugin);
          }
          
          // First initialization should succeed
          await runtime.initialize();
          expect(runtime.getState()).toBe(RuntimeState.Initialized);
          
          // Second initialization should throw
          await expect(runtime.initialize()).rejects.toThrow('Runtime already initialized');
          
          // State should remain Initialized
          expect(runtime.getState()).toBe(RuntimeState.Initialized);
          
          // Cleanup
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should make shutdown idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        // Number of times to call shutdown (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (pluginCount, shutdownCalls) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {}
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize
          await runtime.initialize();
          expect(runtime.getState()).toBe(RuntimeState.Initialized);
          
          // Call shutdown multiple times
          for (let i = 0; i < shutdownCalls; i++) {
            await runtime.shutdown();
            // State should be Shutdown after each call
            expect(runtime.getState()).toBe(RuntimeState.Shutdown);
            expect(runtime.isInitialized()).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle shutdown before initialization gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          
          // State should be Uninitialized
          expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
          
          // Shutdown should be safe to call (idempotent)
          await runtime.shutdown();
          
          // State should remain Uninitialized (not transition to Shutdown)
          expect(runtime.getState()).toBe(RuntimeState.Uninitialized);
          expect(runtime.isInitialized()).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain state consistency through complete lifecycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime({ logger: new ConsoleLogger() });
          const stateTransitions: RuntimeState[] = [];
          
          // Track initial state
          stateTransitions.push(runtime.getState());
          
          // Register plugins that track state during setup and dispose
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async () => {
                stateTransitions.push(runtime.getState());
              },
              dispose: async () => {
                stateTransitions.push(runtime.getState());
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize
          await runtime.initialize();
          stateTransitions.push(runtime.getState());
          
          // Shutdown
          await runtime.shutdown();
          stateTransitions.push(runtime.getState());
          
          // Verify state transitions follow valid sequence
          // Should start with Uninitialized
          expect(stateTransitions[0]).toBe(RuntimeState.Uninitialized);
          
          // All setup callbacks should see Initializing
          for (let i = 1; i <= pluginCount; i++) {
            expect(stateTransitions[i]).toBe(RuntimeState.Initializing);
          }
          
          // After initialization should be Initialized
          expect(stateTransitions[pluginCount + 1]).toBe(RuntimeState.Initialized);
          
          // All dispose callbacks should see ShuttingDown
          for (let i = pluginCount + 2; i < pluginCount + 2 + pluginCount; i++) {
            expect(stateTransitions[i]).toBe(RuntimeState.ShuttingDown);
          }
          
          // Final state should be Shutdown
          expect(stateTransitions[stateTransitions.length - 1]).toBe(RuntimeState.Shutdown);
        }
      ),
      { numRuns: 100 }
    );
  });
});
