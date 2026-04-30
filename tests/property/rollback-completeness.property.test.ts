import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 2: Rollback Completeness
 * 
 * Feature: runtime-hardening, Property 2: Rollback Completeness
 * 
 * For any plugin setup sequence that fails, all previously initialized plugins
 * should have their dispose methods called in reverse order
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
describe('Property 2: Rollback Completeness', () => {
  it('should dispose all initialized plugins in reverse order when setup fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Generate which plugin fails (not the first one, so we have some to rollback)
        fc.integer({ min: 1, max: 9 }),
        async (pluginCount, failIndex) => {
          fc.pre(failIndex < pluginCount && failIndex > 0);
          
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track setup and dispose calls
          const setupCalls: string[] = [];
          const disposeCalls: string[] = [];
          
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
              setup: async (ctx) => {
                setupCalls.push(pluginName);
                if (i === failIndex) {
                  throw new Error(`Plugin ${pluginName} setup failed`);
                }
              },
              dispose: async (ctx) => {
                disposeCalls.push(pluginName);
              }
            });
          }
          
          // Execute setup and expect it to fail
          let setupFailed = false;
          try {
            await registry.executeSetup(mockContext);
          } catch (error) {
            setupFailed = true;
          }
          
          // Verify setup failed
          expect(setupFailed).toBe(true);
          
          // Verify all plugins before failIndex were initialized
          expect(setupCalls.length).toBe(failIndex + 1); // Including the failing one
          
          // Verify dispose was called for all initialized plugins (excluding the failing one)
          expect(disposeCalls.length).toBe(failIndex);
          
          // Verify dispose was called in reverse order
          const expectedDisposeOrder = Array.from({ length: failIndex }, (_, i) => `plugin-${failIndex - 1 - i}`);
          expect(disposeCalls).toEqual(expectedDisposeOrder);
          
          // Verify initializedPlugins is cleared after rollback
          expect(registry.getInitializedPlugins()).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle dispose errors during rollback without stopping cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (3-8)
        fc.integer({ min: 3, max: 8 }),
        // Generate which plugin fails during setup
        fc.integer({ min: 1, max: 7 }),
        // Generate which plugins fail during dispose
        fc.array(fc.boolean(), { minLength: 3, maxLength: 8 }),
        async (pluginCount, failIndex, disposeFailFlags) => {
          fc.pre(failIndex < pluginCount && failIndex > 0);
          
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track dispose calls
          const disposeCalls: string[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext
          const mockContext = {} as any;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            const shouldDisposeThrow = disposeFailFlags[i] ?? false;
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (ctx) => {
                if (i === failIndex) {
                  throw new Error(`Plugin ${pluginName} setup failed`);
                }
              },
              dispose: async (ctx) => {
                disposeCalls.push(pluginName);
                if (shouldDisposeThrow) {
                  throw new Error(`Plugin ${pluginName} dispose failed`);
                }
              }
            });
          }
          
          // Execute setup and expect it to fail
          try {
            await registry.executeSetup(mockContext);
          } catch (error) {
            // Expected to fail
          }
          
          // Verify all plugins before failIndex had dispose called, even if some threw
          expect(disposeCalls.length).toBe(failIndex);
          
          // Verify initializedPlugins is cleared even with dispose errors
          expect(registry.getInitializedPlugins()).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should pass RuntimeContext to dispose callbacks during rollback', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-6)
        fc.integer({ min: 2, max: 6 }),
        // Generate which plugin fails
        fc.integer({ min: 1, max: 5 }),
        async (pluginCount, failIndex) => {
          fc.pre(failIndex < pluginCount && failIndex > 0);
          
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
          // Track contexts passed to dispose
          const disposeContexts: any[] = [];
          
          const logger = new ConsoleLogger();
          const registry = new PluginRegistry(logger);
          
          // Create mock RuntimeContext with a unique marker
          const mockContext = { marker: 'test-context' } as any;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            
            registry.registerPlugin({
              name: pluginName,
              version: '1.0.0',
              setup: async (ctx) => {
                if (i === failIndex) {
                  throw new Error(`Plugin ${pluginName} setup failed`);
                }
              },
              dispose: async (ctx) => {
                disposeContexts.push(ctx);
              }
            });
          }
          
          // Execute setup and expect it to fail
          try {
            await registry.executeSetup(mockContext);
          } catch (error) {
            // Expected to fail
          }
          
          // Verify all dispose calls received the correct context
          expect(disposeContexts.length).toBe(failIndex);
          disposeContexts.forEach(ctx => {
            expect(ctx).toBe(mockContext);
            expect(ctx.marker).toBe('test-context');
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include failing plugin name in thrown error', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-6)
        fc.integer({ min: 2, max: 6 }),
        // Generate which plugin fails
        fc.integer({ min: 0, max: 5 }),
        async (pluginCount, failIndex) => {
          fc.pre(failIndex < pluginCount);
          
          const { PluginRegistry } = await import('../../src/plugin-registry.js');
          const { ConsoleLogger } = await import('../../src/types.js');
          
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
              setup: async (ctx) => {
                if (i === failIndex) {
                  throw new Error(`Setup error`);
                }
              },
              dispose: async (ctx) => {
                // No-op
              }
            });
          }
          
          // Execute setup and capture error
          let thrownError: Error | null = null;
          try {
            await registry.executeSetup(mockContext);
          } catch (error) {
            thrownError = error as Error;
          }
          
          // Verify error includes plugin name
          expect(thrownError).not.toBeNull();
          expect(thrownError!.message).toContain(`plugin-${failIndex}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
