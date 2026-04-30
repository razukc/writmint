import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition } from '../../src/types.js';

// Event names are generated without '*'. EventBus treats event names containing
// '*' as wildcard patterns; if a literal '*' is registered as both a handler
// name and emitted as an event, exact-match and wildcard-match both fire,
// double-counting deliveries. That interaction is real EventBus behavior and
// is tracked separately; these properties are about delivery semantics for
// non-pattern event names.
const eventNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('*'));

/**
 * Property 46: Event delivery to all listeners
 * 
 * Feature: documentation-engine, Property 46: Event delivery to all listeners
 * 
 * For any event emitted, the Event Bus should deliver the event to all registered listeners
 * 
 * Validates: Requirements 11.5
 */
describe('Property 46: Event delivery to all listeners', () => {
  it('should deliver events to all registered listeners', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of listeners (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        // Generate event data
        fc.anything(),
        async (listenerCount, eventName, eventData) => {
          const runtime = new Runtime();
          
          // Track which listeners received the event
          const listenersInvoked = new Set<number>();
          const dataReceived: unknown[] = [];
          
          // Register a plugin that sets up multiple listeners
          const plugin: PluginDefinition = {
            name: 'event-test-plugin',
            version: '1.0.0',
            setup: async (ctx) => {
              // Register multiple listeners for the same event
              for (let i = 0; i < listenerCount; i++) {
                ctx.events.on(eventName, (data) => {
                  listenersInvoked.add(i);
                  dataReceived.push(data);
                });
              }
            }
          };
          
          runtime.registerPlugin(plugin);
          await runtime.initialize();
          
          const context = runtime.getContext();
          
          // Emit the event
          context.events.emit(eventName, eventData);
          
          // Verify all listeners were invoked
          expect(listenersInvoked.size).toBe(listenerCount);
          
          // Verify all listeners received the same data
          expect(dataReceived.length).toBe(listenerCount);
          for (const received of dataReceived) {
            expect(received).toEqual(eventData);
          }
          
          // Verify all listener indices were invoked
          for (let i = 0; i < listenerCount; i++) {
            expect(listenersInvoked.has(i)).toBe(true);
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver events to listeners across multiple plugins', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of plugins (2-8)
        fc.integer({ min: 2, max: 8 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        // Generate event data
        fc.record({
          value: fc.integer(),
          message: fc.string()
        }),
        async (pluginCount, eventName, eventData) => {
          const runtime = new Runtime();
          
          // Track which plugins received the event
          const pluginsInvoked = new Set<string>();
          const dataReceivedByPlugin = new Map<string, unknown>();
          
          // Register multiple plugins, each with a listener
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            const plugin: PluginDefinition = {
              name: pluginName,
              version: '1.0.0',
              setup: async (ctx) => {
                ctx.events.on(eventName, (data) => {
                  pluginsInvoked.add(pluginName);
                  dataReceivedByPlugin.set(pluginName, data);
                });
              }
            };
            runtime.registerPlugin(plugin);
          }
          
          await runtime.initialize();
          
          const context = runtime.getContext();
          
          // Emit the event
          context.events.emit(eventName, eventData);
          
          // Verify all plugins received the event
          expect(pluginsInvoked.size).toBe(pluginCount);
          
          // Verify all plugins received the same data
          expect(dataReceivedByPlugin.size).toBe(pluginCount);
          for (let i = 0; i < pluginCount; i++) {
            const pluginName = `plugin-${i}`;
            expect(pluginsInvoked.has(pluginName)).toBe(true);
            expect(dataReceivedByPlugin.get(pluginName)).toEqual(eventData);
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver events in registration order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of listeners (2-10)
        fc.integer({ min: 2, max: 10 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        async (listenerCount, eventName) => {
          const runtime = new Runtime();
          
          // Track invocation order
          const invocationOrder: number[] = [];
          
          // Register a plugin that sets up multiple listeners
          const plugin: PluginDefinition = {
            name: 'order-test-plugin',
            version: '1.0.0',
            setup: async (ctx) => {
              // Register multiple listeners in order
              for (let i = 0; i < listenerCount; i++) {
                ctx.events.on(eventName, () => {
                  invocationOrder.push(i);
                });
              }
            }
          };
          
          runtime.registerPlugin(plugin);
          await runtime.initialize();
          
          const context = runtime.getContext();
          
          // Emit the event
          context.events.emit(eventName);
          
          // Verify listeners were invoked in registration order
          expect(invocationOrder.length).toBe(listenerCount);
          for (let i = 0; i < listenerCount; i++) {
            expect(invocationOrder[i]).toBe(i);
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver events even if some listeners throw errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of listeners (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Generate which listeners should fail (at least one success before and after)
        fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 3 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        async (listenerCount, failIndices, eventName) => {
          // Ensure fail indices are within bounds and unique
          const uniqueFailIndices = new Set(
            failIndices
              .filter(idx => idx < listenerCount)
              .slice(0, Math.min(failIndices.length, listenerCount - 1))
          );
          
          // Skip if no valid fail indices
          fc.pre(uniqueFailIndices.size > 0);
          
          const runtime = new Runtime();
          
          // Track which listeners were invoked (including failed ones)
          const listenersInvoked = new Set<number>();
          
          // Register a plugin that sets up multiple listeners
          const plugin: PluginDefinition = {
            name: 'error-test-plugin',
            version: '1.0.0',
            setup: async (ctx) => {
              // Register multiple listeners, some will throw errors
              for (let i = 0; i < listenerCount; i++) {
                ctx.events.on(eventName, () => {
                  listenersInvoked.add(i);
                  
                  // Throw error if this listener should fail
                  if (uniqueFailIndices.has(i)) {
                    throw new Error(`Listener ${i} failed`);
                  }
                });
              }
            }
          };
          
          runtime.registerPlugin(plugin);
          await runtime.initialize();
          
          const context = runtime.getContext();
          
          // Emit the event (should not throw despite listener errors)
          expect(() => {
            context.events.emit(eventName);
          }).not.toThrow();
          
          // Verify all listeners were invoked, including the ones that threw
          expect(listenersInvoked.size).toBe(listenerCount);
          
          // Verify all listener indices were invoked
          for (let i = 0; i < listenerCount; i++) {
            expect(listenersInvoked.has(i)).toBe(true);
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver events to listeners added after initialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of initial listeners (1-5)
        fc.integer({ min: 1, max: 5 }),
        // Generate number of late listeners (1-5)
        fc.integer({ min: 1, max: 5 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        async (initialListeners, lateListeners, eventName) => {
          const runtime = new Runtime();
          
          // Track which listeners received the event
          const listenersInvoked = new Set<string>();
          
          // Register a plugin with initial listeners
          const plugin: PluginDefinition = {
            name: 'initial-listeners-plugin',
            version: '1.0.0',
            setup: async (ctx) => {
              for (let i = 0; i < initialListeners; i++) {
                ctx.events.on(eventName, () => {
                  listenersInvoked.add(`initial-${i}`);
                });
              }
            }
          };
          
          runtime.registerPlugin(plugin);
          await runtime.initialize();
          
          const context = runtime.getContext();
          
          // Add more listeners after initialization
          for (let i = 0; i < lateListeners; i++) {
            context.events.on(eventName, () => {
              listenersInvoked.add(`late-${i}`);
            });
          }
          
          // Emit the event
          context.events.emit(eventName);
          
          // Verify all listeners (initial + late) received the event
          const totalListeners = initialListeners + lateListeners;
          expect(listenersInvoked.size).toBe(totalListeners);
          
          // Verify all initial listeners were invoked
          for (let i = 0; i < initialListeners; i++) {
            expect(listenersInvoked.has(`initial-${i}`)).toBe(true);
          }
          
          // Verify all late listeners were invoked
          for (let i = 0; i < lateListeners; i++) {
            expect(listenersInvoked.has(`late-${i}`)).toBe(true);
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not deliver events to unsubscribed listeners', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of listeners (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Generate which listeners to unsubscribe (at least one remains)
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
        // Generate event name (see top-of-file comment on '*' exclusion)
        eventNameArb,
        async (listenerCount, unsubIndices, eventName) => {
          // Ensure unsub indices are within bounds and unique
          const uniqueUnsubIndices = new Set(
            unsubIndices
              .filter(idx => idx < listenerCount)
              .slice(0, Math.min(unsubIndices.length, listenerCount - 1))
          );
          
          // Skip if no valid unsub indices or all would be unsubscribed
          fc.pre(uniqueUnsubIndices.size > 0 && uniqueUnsubIndices.size < listenerCount);
          
          const runtime = new Runtime();
          
          // Track which listeners were invoked
          const listenersInvoked = new Set<number>();
          const unsubscribeFunctions: (() => void)[] = [];
          
          // Register a plugin that sets up multiple listeners
          const plugin: PluginDefinition = {
            name: 'unsub-test-plugin',
            version: '1.0.0',
            setup: async (ctx) => {
              // Register multiple listeners and store unsubscribe functions
              for (let i = 0; i < listenerCount; i++) {
                const unsub = ctx.events.on(eventName, () => {
                  listenersInvoked.add(i);
                });
                unsubscribeFunctions.push(unsub);
              }
            }
          };
          
          runtime.registerPlugin(plugin);
          await runtime.initialize();
          
          // Unsubscribe selected listeners
          for (const idx of uniqueUnsubIndices) {
            unsubscribeFunctions[idx]();
          }
          
          const context = runtime.getContext();
          
          // Emit the event
          context.events.emit(eventName);
          
          // Verify only non-unsubscribed listeners were invoked
          const expectedInvoked = listenerCount - uniqueUnsubIndices.size;
          expect(listenersInvoked.size).toBe(expectedInvoked);
          
          // Verify unsubscribed listeners were NOT invoked
          for (const idx of uniqueUnsubIndices) {
            expect(listenersInvoked.has(idx)).toBe(false);
          }
          
          // Verify non-unsubscribed listeners WERE invoked
          for (let i = 0; i < listenerCount; i++) {
            if (!uniqueUnsubIndices.has(i)) {
              expect(listenersInvoked.has(i)).toBe(true);
            }
          }
          
          await runtime.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });
});
