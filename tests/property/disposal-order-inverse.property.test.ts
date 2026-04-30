import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 3: Disposal Order Inverse
 * 
 * Feature: runtime-hardening, Property 3: Disposal Order Inverse
 * 
 * For any set of successfully initialized plugins, disposal order should be
 * the exact reverse of initialization order
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
describe('Property 3: Disposal Order Inverse', () => {
  it('should dispose plugins in exact reverse order of initialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-10)
        fc.integer({ min: 2, max: 10 }),
        async (pluginCount) => {
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track initialization and disposal order
          const initOrder: string[] = [];
          const disposeOrder: string[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (_ctx) => {
                initOrder.push(pluginName);
              },
              dispose: async (_ctx) => {
                disposeOrder.push(pluginName);
              }
            });
          }
          
          // Execute setup - should succeed
          await registry.executeSetup(mockContext);
          
          // Verify all plugins were initialized
          expect(initOrder.length).toBe(pluginCount);
          
          // Execute dispose
          await registry.executeDispose(mockContext);
          
          // Verify all plugins were disposed
          expect(disposeOrder.length).toBe(pluginCount);
          
          // Verify disposal order is exact reverse of initialization order
          const expectedDisposeOrder = [...initOrder].reverse();
          expect(disposeOrder).toEqual(expectedDisposeOrder);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain reverse disposal order even when some plugins lack dispose callbacks', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Generate which plugins have dispose callbacks
        fc.array(fc.boolean(), { minLength: 3, maxLength: 10 }),
        async (pluginCount, hasDisposeFlags) => {
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Ensure at least one plugin has dispose and one doesn't
          const hasDispose = hasDisposeFlags.slice(0, pluginCount);
          const someHaveDispose = hasDispose.some(h => h);
          const someLackDispose = hasDispose.some(h => !h);
          
          fc.pre(someHaveDispose && someLackDispose);
          
          // Track initialization and disposal order
          const initOrder: string[] = [];
          const disposeOrder: string[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (_ctx) => {
                initOrder.push(pluginName);
              },
              dispose: hasDispose[i] ? async (_ctx) => {
                disposeOrder.push(pluginName);
              } : undefined
            });
          }
          
          // Execute setup - should succeed
          await registry.executeSetup(mockContext);
          
          // Verify all plugins were initialized
          expect(initOrder.length).toBe(pluginCount);
          
          // Execute dispose
          await registry.executeDispose(mockContext);
          
          // Verify only plugins with dispose callbacks were disposed
          const expectedDisposeOrder = initOrder
            .filter((_, idx) => hasDispose[idx])
            .reverse();
          expect(disposeOrder).toEqual(expectedDisposeOrder);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should track initialization order correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-8)
        fc.integer({ min: 2, max: 8 }),
        async (pluginCount) => {
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          const pluginNames: string[] = [];
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            pluginNames.push(pluginName);
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (_ctx) => {
                // No-op
              },
              dispose: async (_ctx) => {
                // No-op
              }
            });
          }
          
          // Execute setup
          await registry.executeSetup(mockContext);
          
          // Verify getInitializedPlugins returns plugins in initialization order
          const initializedPlugins = registry.getInitializedPlugins();
          expect(initializedPlugins).toEqual(pluginNames);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should dispose last initialized plugin first', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-10)
        fc.integer({ min: 2, max: 10 }),
        async (pluginCount) => {
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track disposal order
          const disposeOrder: string[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (_ctx) => {
                // No-op
              },
              dispose: async (_ctx) => {
                disposeOrder.push(pluginName);
              }
            });
          }
          
          // Execute setup
          await registry.executeSetup(mockContext);
          
          // Execute dispose
          await registry.executeDispose(mockContext);
          
          // Verify last initialized plugin was disposed first
          expect(disposeOrder[0]).toBe(`plugin-${pluginCount - 1}`);
          
          // Verify first initialized plugin was disposed last
          expect(disposeOrder[disposeOrder.length - 1]).toBe('plugin-0');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain disposal order even with dispose errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (3-8)
        fc.integer({ min: 3, max: 8 }),
        // Generate which plugins fail during dispose
        fc.array(fc.boolean(), { minLength: 3, maxLength: 8 }),
        async (pluginCount, disposeFailFlags) => {
          // Ensure at least one dispose fails
          const shouldFail = disposeFailFlags.slice(0, pluginCount);
          const someDisposeFails = shouldFail.some(f => f);
          
          fc.pre(someDisposeFails);
          
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track disposal attempts (even if they throw)
          const disposeAttempts: string[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          const pluginNames: string[] = [];
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            pluginNames.push(pluginName);
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (_ctx) => {
                // No-op
              },
              dispose: async (_ctx) => {
                disposeAttempts.push(pluginName);
                if (shouldFail[i]) {
                  throw new Error(`Plugin ${pluginName} dispose failed`);
                }
              }
            });
          }
          
          // Execute setup
          await registry.executeSetup(mockContext);
          
          // Execute dispose
          await registry.executeDispose(mockContext);
          
          // Verify all plugins had dispose attempted
          expect(disposeAttempts.length).toBe(pluginCount);
          
          // Verify disposal attempts were in reverse order
          const expectedOrder = [...pluginNames].reverse();
          expect(disposeAttempts).toEqual(expectedOrder);
        }
      ),
      { numRuns: 100 }
    );
  });
});
