import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * Integration tests for lifecycle events.
 * Tests Requirements: 17.1, 17.2, 17.3, 17.4, 17.5
 */
describe('Lifecycle events integration tests', () => {
  let runtime: Runtime;

  beforeEach(() => {
    runtime = new Runtime();
  });

  describe('runtime:initialized event', () => {
    it('should emit runtime:initialized event after successful initialization (Requirement 17.1)', async () => {
      let eventEmitted = false;
      let eventData: any = null;

      const plugin: PluginDefinition = {
        name: 'listener-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Subscribe to runtime:initialized event during setup
          context.events.on('runtime:initialized', (data: unknown) => {
            eventEmitted = true;
            eventData = data;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Verify event was emitted
      expect(eventEmitted).toBe(true);
      expect(eventData).not.toBeNull();
    });

    it('should include RuntimeContext in runtime:initialized event (Requirement 17.3)', async () => {
      let receivedContext: RuntimeContext | null = null;

      const plugin: PluginDefinition = {
        name: 'context-listener',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', (data: any) => {
            receivedContext = data?.context;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const actualContext = runtime.getContext();

      // Verify context was included in event
      expect(receivedContext).not.toBeNull();
      expect(receivedContext).toBe(actualContext);
    });

    it('should emit runtime:initialized only after initialization completes (Requirement 17.1)', async () => {
      const events: string[] = [];

      const plugin: PluginDefinition = {
        name: 'order-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          events.push('setup-start');
          
          context.events.on('runtime:initialized', () => {
            events.push('runtime:initialized');
          });
          
          events.push('setup-end');
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Verify event is emitted after setup completes
      expect(events).toEqual(['setup-start', 'setup-end', 'runtime:initialized']);
    });

    it('should not emit runtime:initialized if initialization fails', async () => {
      let eventEmitted = false;

      const failingPlugin: PluginDefinition = {
        name: 'failing-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            eventEmitted = true;
          });
          
          throw new Error('Setup failed');
        }
      };

      runtime.registerPlugin(failingPlugin);

      await expect(runtime.initialize()).rejects.toThrow('Setup failed');
      
      // Verify event was not emitted
      expect(eventEmitted).toBe(false);
    });

    it('should allow multiple plugins to subscribe to runtime:initialized', async () => {
      const plugin1Events: string[] = [];
      const plugin2Events: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            plugin1Events.push('initialized');
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            plugin2Events.push('initialized');
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();

      // Both plugins should receive the event
      expect(plugin1Events).toEqual(['initialized']);
      expect(plugin2Events).toEqual(['initialized']);
    });
  });

  describe('runtime:shutdown event', () => {
    it('should emit runtime:shutdown event during shutdown (Requirement 17.4)', async () => {
      let eventEmitted = false;
      let eventData: any = null;

      const plugin: PluginDefinition = {
        name: 'shutdown-listener',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', (data: unknown) => {
            eventEmitted = true;
            eventData = data;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();

      // Verify event was emitted
      expect(eventEmitted).toBe(true);
      expect(eventData).not.toBeNull();
    });

    it('should include RuntimeContext in runtime:shutdown event (Requirement 17.5)', async () => {
      let receivedContext: RuntimeContext | null = null;

      const plugin: PluginDefinition = {
        name: 'context-listener',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', (data: any) => {
            receivedContext = data?.context;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      
      const actualContext = runtime.getContext();
      
      await runtime.shutdown();

      // Verify context was included in event
      expect(receivedContext).not.toBeNull();
      expect(receivedContext).toBe(actualContext);
    });

    it('should emit runtime:shutdown at start of shutdown (Requirement 17.4)', async () => {
      const events: string[] = [];

      const plugin: PluginDefinition = {
        name: 'order-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', () => {
            events.push('runtime:shutdown');
          });
        },
        dispose: () => {
          events.push('dispose');
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();

      // Verify event is emitted before dispose
      expect(events).toEqual(['runtime:shutdown', 'dispose']);
    });

    it('should allow multiple plugins to subscribe to runtime:shutdown', async () => {
      const plugin1Events: string[] = [];
      const plugin2Events: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', () => {
            plugin1Events.push('shutdown');
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', () => {
            plugin2Events.push('shutdown');
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();
      await runtime.shutdown();

      // Both plugins should receive the event
      expect(plugin1Events).toEqual(['shutdown']);
      expect(plugin2Events).toEqual(['shutdown']);
    });

    it('should emit runtime:shutdown even if no plugins are registered', async () => {
      let eventEmitted = false;

      await runtime.initialize();
      
      const context = runtime.getContext();
      context.events.on('runtime:shutdown', () => {
        eventEmitted = true;
      });
      
      await runtime.shutdown();

      // Verify event was emitted
      expect(eventEmitted).toBe(true);
    });
  });

  describe('Plugins subscribing to lifecycle events', () => {
    it('should allow plugins to react to runtime:initialized (Requirement 17.1, 17.2, 17.3)', async () => {
      const actions: string[] = [];

      const plugin: PluginDefinition = {
        name: 'reactive-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          actions.push('setup');
          
          context.events.on('runtime:initialized', (data: any) => {
            actions.push('initialized-event');
            
            // Plugin can perform actions in response to initialization
            if (data?.context) {
              context.actions.registerAction({
                id: 'post-init-action',
                handler: async () => {
                  actions.push('action-executed');
                  return 'success';
                }
              });
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      await context.actions.runAction('post-init-action');

      // Verify plugin reacted to initialization event
      expect(actions).toEqual(['setup', 'initialized-event', 'action-executed']);
    });

    it('should allow plugins to react to runtime:shutdown (Requirement 17.4, 17.5)', async () => {
      const cleanupActions: string[] = [];

      const plugin: PluginDefinition = {
        name: 'cleanup-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', (data: any) => {
            cleanupActions.push('shutdown-event');
            
            // Plugin can perform cleanup in response to shutdown
            if (data?.context) {
              cleanupActions.push('cleanup-performed');
            }
          });
        },
        dispose: () => {
          cleanupActions.push('dispose');
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();

      // Verify plugin reacted to shutdown event before dispose
      expect(cleanupActions).toEqual(['shutdown-event', 'cleanup-performed', 'dispose']);
    });

    it('should allow plugins to coordinate using lifecycle events', async () => {
      const coordinationLog: string[] = [];

      const coordinatorPlugin: PluginDefinition = {
        name: 'coordinator',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            coordinationLog.push('coordinator-initialized');
            context.events.emit('coordinator-ready');
          });
        }
      };

      const workerPlugin: PluginDefinition = {
        name: 'worker',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('coordinator-ready', () => {
            coordinationLog.push('worker-received-coordinator-ready');
          });
          
          context.events.on('runtime:initialized', () => {
            coordinationLog.push('worker-initialized');
          });
        }
      };

      runtime.registerPlugin(coordinatorPlugin);
      runtime.registerPlugin(workerPlugin);
      await runtime.initialize();

      // Verify coordination through lifecycle events
      expect(coordinationLog).toContain('coordinator-initialized');
      expect(coordinationLog).toContain('worker-initialized');
      expect(coordinationLog).toContain('worker-received-coordinator-ready');
    });

    it('should allow plugins to access RuntimeContext from lifecycle events', async () => {
      let contextFromInitEvent: RuntimeContext | null = null;
      let contextFromShutdownEvent: RuntimeContext | null = null;

      const plugin: PluginDefinition = {
        name: 'context-access-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', (data: any) => {
            contextFromInitEvent = data?.context;
            
            // Verify we can use the context
            if (contextFromInitEvent) {
              contextFromInitEvent.screens.registerScreen({
                id: 'event-screen',
                title: 'Event Screen',
                component: 'EventComponent'
              });
            }
          });
          
          context.events.on('runtime:shutdown', (data: any) => {
            contextFromShutdownEvent = data?.context;
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const actualContext = runtime.getContext();
      
      // Verify context from init event is valid
      expect(contextFromInitEvent).toBe(actualContext);
      expect(actualContext.screens.getScreen('event-screen')).not.toBeNull();
      
      await runtime.shutdown();
      
      // Verify context from shutdown event is valid
      expect(contextFromShutdownEvent).toBe(actualContext);
    });

    it('should emit lifecycle events through EventBus (Requirement 17.1, 17.4)', async () => {
      const eventsReceived: string[] = [];

      const plugin: PluginDefinition = {
        name: 'event-tracker',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Subscribe to both lifecycle events
          context.events.on('runtime:initialized', () => {
            eventsReceived.push('initialized');
          });
          
          context.events.on('runtime:shutdown', () => {
            eventsReceived.push('shutdown');
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
      await runtime.shutdown();

      // Verify both events were emitted through EventBus
      expect(eventsReceived).toEqual(['initialized', 'shutdown']);
    });

    it('should handle errors in lifecycle event handlers gracefully', async () => {
      const eventsReceived: string[] = [];

      const throwingPlugin: PluginDefinition = {
        name: 'throwing-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            eventsReceived.push('throwing-handler');
            throw new Error('Handler error');
          });
        }
      };

      const normalPlugin: PluginDefinition = {
        name: 'normal-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            eventsReceived.push('normal-handler');
          });
        }
      };

      runtime.registerPlugin(throwingPlugin);
      runtime.registerPlugin(normalPlugin);
      
      // Should not throw despite handler error
      await expect(runtime.initialize()).resolves.not.toThrow();

      // Both handlers should have been invoked
      expect(eventsReceived).toContain('throwing-handler');
      expect(eventsReceived).toContain('normal-handler');
    });
  });

  describe('Lifecycle event timing', () => {
    it('should emit runtime:initialized after all plugin setups complete', async () => {
      const timeline: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {
          timeline.push('plugin1-setup');
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          timeline.push('plugin2-setup');
          
          context.events.on('runtime:initialized', () => {
            timeline.push('initialized-event');
          });
        }
      };

      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: () => {
          timeline.push('plugin3-setup');
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      await runtime.initialize();

      // Event should be emitted after all setups
      expect(timeline).toEqual([
        'plugin1-setup',
        'plugin2-setup',
        'plugin3-setup',
        'initialized-event'
      ]);
    });

    it('should emit runtime:shutdown before plugin disposal', async () => {
      const timeline: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:shutdown', () => {
            timeline.push('shutdown-event');
          });
        },
        dispose: () => {
          timeline.push('plugin1-dispose');
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {
          timeline.push('plugin2-dispose');
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();
      await runtime.shutdown();

      // Event should be emitted before disposal
      expect(timeline[0]).toBe('shutdown-event');
      expect(timeline).toContain('plugin1-dispose');
      expect(timeline).toContain('plugin2-dispose');
    });

    it('should allow async operations in lifecycle event handlers', async () => {
      const operations: string[] = [];

      const plugin: PluginDefinition = {
        name: 'async-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', async () => {
            operations.push('async-start');
            await new Promise(resolve => setTimeout(resolve, 10));
            operations.push('async-end');
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Give async handler time to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify async operations completed
      expect(operations).toEqual(['async-start', 'async-end']);
    });
  });

  describe('Multiple runtime instances', () => {
    it('should emit lifecycle events independently for each runtime instance', async () => {
      const runtime1Events: string[] = [];
      const runtime2Events: string[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            runtime1Events.push('initialized');
          });
          context.events.on('runtime:shutdown', () => {
            runtime1Events.push('shutdown');
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.events.on('runtime:initialized', () => {
            runtime2Events.push('initialized');
          });
          context.events.on('runtime:shutdown', () => {
            runtime2Events.push('shutdown');
          });
        }
      };

      const runtime1 = new Runtime();
      const runtime2 = new Runtime();

      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);

      await runtime1.initialize();
      await runtime2.initialize();

      // Each runtime should have received its own events
      expect(runtime1Events).toEqual(['initialized']);
      expect(runtime2Events).toEqual(['initialized']);

      await runtime1.shutdown();
      
      // Only runtime1 should have received shutdown
      expect(runtime1Events).toEqual(['initialized', 'shutdown']);
      expect(runtime2Events).toEqual(['initialized']);

      await runtime2.shutdown();
      
      // Now runtime2 should have received shutdown
      expect(runtime2Events).toEqual(['initialized', 'shutdown']);
    });
  });
});
