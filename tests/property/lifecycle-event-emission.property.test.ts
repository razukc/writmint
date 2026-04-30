import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition } from '../../src/types.js';

/**
 * Property 9: Lifecycle Event Emission
 * 
 * Feature: runtime-hardening, Property 9: Lifecycle Event Emission
 * 
 * For any successful initialization, a runtime:initialized event should be emitted;
 * for any shutdown, a runtime:shutdown event should be emitted
 * 
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */
describe('Property 9: Lifecycle Event Emission', () => {
  it('should emit runtime:initialized after successful initialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (0-5)
        fc.integer({ min: 0, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime();
          
          // Track events emitted
          let initializedEmitted = false;
          let initializedEventData: any = null;
          
          // Register plugins that will succeed
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async (ctx) => {
                // Subscribe to lifecycle event during setup
                if (i === 0) {
                  ctx.events.on('runtime:initialized', (data) => {
                    initializedEmitted = true;
                    initializedEventData = data;
                  });
                }
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // If no plugins, subscribe before initialization
          if (pluginCount === 0) {
            await runtime.initialize();
            const context = runtime.getContext();
            context.events.on('runtime:initialized', (data) => {
              initializedEmitted = true;
              initializedEventData = data;
            });
            
            // Event should have already been emitted
            // We need to test this differently - subscribe before init
            await runtime.shutdown();
            
            // Re-test with subscription before init
            const runtime2 = new Runtime();
            let emitted2 = false;
            let eventData2: any = null;
            
            // We need to subscribe before initialization, but we can't access context yet
            // Let's use a plugin to subscribe
            runtime2.registerPlugin({
              name: 'listener',
              version: '1.0.0',
              setup: async (ctx) => {
                ctx.events.on('runtime:initialized', (data) => {
                  emitted2 = true;
                  eventData2 = data;
                });
              }
            });
            
            await runtime2.initialize();
            
            // Verify event was emitted
            expect(emitted2).toBe(true);
            expect(eventData2).toBeDefined();
            expect(eventData2.context).toBeDefined();
            expect(eventData2.context).toBe(runtime2.getContext());
            
            await runtime2.shutdown();
            return;
          }
          
          // Initialize runtime
          await runtime.initialize();
          
          // Verify event was emitted
          expect(initializedEmitted).toBe(true);
          expect(initializedEventData).toBeDefined();
          expect(initializedEventData.context).toBeDefined();
          expect(initializedEventData.context).toBe(runtime.getContext());
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should emit runtime:shutdown during shutdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (0-5)
        fc.integer({ min: 0, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime();
          
          // Track events emitted
          let shutdownEmitted = false;
          let shutdownEventData: any = null;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async (ctx) => {
                // Subscribe to shutdown event during setup
                if (i === 0) {
                  ctx.events.on('runtime:shutdown', (data) => {
                    shutdownEmitted = true;
                    shutdownEventData = data;
                  });
                }
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // If no plugins, subscribe after initialization
          if (pluginCount === 0) {
            await runtime.initialize();
            const context = runtime.getContext();
            context.events.on('runtime:shutdown', (data) => {
              shutdownEmitted = true;
              shutdownEventData = data;
            });
          } else {
            await runtime.initialize();
          }
          
          // Shutdown runtime
          await runtime.shutdown();
          
          // Verify event was emitted
          expect(shutdownEmitted).toBe(true);
          expect(shutdownEventData).toBeDefined();
          expect(shutdownEventData.context).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should emit both lifecycle events in correct order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (1-5)
        fc.integer({ min: 1, max: 5 }),
        async (pluginCount) => {
          const runtime = new Runtime();
          
          // Track events emitted in order
          const eventsEmitted: string[] = [];
          const eventDataMap: Map<string, any> = new Map();
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async (ctx) => {
                // Subscribe to both events during setup
                if (i === 0) {
                  ctx.events.on('runtime:initialized', (data) => {
                    eventsEmitted.push('runtime:initialized');
                    eventDataMap.set('runtime:initialized', data);
                  });
                  ctx.events.on('runtime:shutdown', (data) => {
                    eventsEmitted.push('runtime:shutdown');
                    eventDataMap.set('runtime:shutdown', data);
                  });
                }
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize runtime
          await runtime.initialize();
          
          // Shutdown runtime
          await runtime.shutdown();
          
          // Verify both events were emitted in correct order
          expect(eventsEmitted).toEqual(['runtime:initialized', 'runtime:shutdown']);
          
          // Verify both events included RuntimeContext
          const initData = eventDataMap.get('runtime:initialized');
          expect(initData).toBeDefined();
          expect(initData.context).toBeDefined();
          
          const shutdownData = eventDataMap.get('runtime:shutdown');
          expect(shutdownData).toBeDefined();
          expect(shutdownData.context).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not emit runtime:initialized if initialization fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins before failure (1-3)
        fc.integer({ min: 1, max: 3 }),
        // Generate which plugin fails (0-2, must be less than pluginCount)
        fc.integer({ min: 0, max: 2 }),
        async (pluginCount, failIndex) => {
          fc.pre(failIndex < pluginCount);
          
          const runtime = new Runtime();
          
          // Track events emitted
          let initializedEmitted = false;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async (ctx) => {
                // Subscribe to event in first plugin
                if (i === 0) {
                  ctx.events.on('runtime:initialized', () => {
                    initializedEmitted = true;
                  });
                }
                
                // Fail at specified index
                if (i === failIndex) {
                  throw new Error(`Plugin ${i} setup failed`);
                }
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Try to initialize runtime (should fail)
          let initFailed = false;
          try {
            await runtime.initialize();
          } catch (error) {
            initFailed = true;
          }
          
          // Verify initialization failed
          expect(initFailed).toBe(true);
          
          // Verify runtime:initialized was NOT emitted
          expect(initializedEmitted).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include the same RuntimeContext in both events', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (1-4)
        fc.integer({ min: 1, max: 4 }),
        async (pluginCount) => {
          const runtime = new Runtime();
          
          // Track contexts from events
          let initContext: any = null;
          let shutdownContext: any = null;
          
          // Register plugins
          for (let i = 0; i < pluginCount; i++) {
            const plugin: PluginDefinition = {
              name: `plugin-${i}`,
              version: '1.0.0',
              setup: async (ctx) => {
                // Subscribe to both events during setup
                if (i === 0) {
                  ctx.events.on('runtime:initialized', (data: any) => {
                    initContext = data.context;
                  });
                  ctx.events.on('runtime:shutdown', (data: any) => {
                    shutdownContext = data.context;
                  });
                }
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          // Initialize and shutdown
          await runtime.initialize();
          const actualContext = runtime.getContext();
          await runtime.shutdown();
          
          // Verify both events received the same context
          expect(initContext).toBe(actualContext);
          expect(shutdownContext).toBe(actualContext);
          expect(initContext).toBe(shutdownContext);
        }
      ),
      { numRuns: 100 }
    );
  });
});
