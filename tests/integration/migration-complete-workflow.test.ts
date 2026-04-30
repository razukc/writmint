import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * Integration test for complete migration support workflow.
 * Tests the end-to-end functionality of host context injection, introspection API,
 * and plugin interaction with host services.
 * 
 * Tests Requirements: 1.1, 1.2, 1.3, 3.1, 4.1, 5.1, 6.1
 */
describe('Migration complete workflow integration test', () => {
  let runtime: Runtime;

  afterEach(async () => {
    if (runtime?.isInitialized()) {
      await runtime.shutdown();
    }
  });

  describe('Complete workflow: Host context + Plugins + Introspection', () => {
    it('should support full migration workflow with host services and introspection (Requirements 1.1, 1.2, 1.3, 3.1, 4.1, 5.1, 6.1)', async () => {
      // Step 1: Create mock host services (simulating legacy application services)
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'User 1' }] }),
        connect: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn().mockResolvedValue(true)
      };

      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      };

      const mockCache = {
        get: vi.fn().mockReturnValue(null),
        set: vi.fn(),
        clear: vi.fn()
      };

      const mockApiClient = {
        get: vi.fn().mockResolvedValue({ data: { status: 'ok' } }),
        post: vi.fn().mockResolvedValue({ data: { created: true } })
      };

      // Step 2: Create runtime with host context (Requirement 1.1)
      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger,
          cache: mockCache,
          api: mockApiClient
        }
      });

      // Step 3: Register plugins that use host services
      const dataPlugin: PluginDefinition = {
        name: 'data-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Verify host context is accessible (Requirement 1.2)
          expect(context.host).toBeDefined();
          expect(context.host.db).toBe(mockDb);

          // Register screen
          context.screens.registerScreen({
            id: 'data-screen',
            title: 'Data Management',
            component: 'DataComponent'
          });

          // Register action that uses host database service
          context.actions.registerAction({
            id: 'fetch-users',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db, logger, cache } = ctx.host as any;
              
              // Try cache first
              const cached = cache.get('users');
              if (cached) {
                logger.log('Cache hit for users');
                return cached;
              }

              // Query database
              logger.log('Fetching users from database');
              const result = await db.query('SELECT * FROM users');
              
              // Store in cache
              cache.set('users', result.rows);
              
              return result.rows;
            },
            timeout: 5000
          });

          // Register action that uses API client
          context.actions.registerAction({
            id: 'sync-data',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { api, logger } = ctx.host as any;
              
              logger.log('Syncing data with external API');
              const response = await api.post('/sync', params);
              
              return response.data;
            }
          });
        }
      };

      const analyticsPlugin: PluginDefinition = {
        name: 'analytics-plugin',
        version: '2.0.0',
        setup: (context: RuntimeContext) => {
          // Register screen
          context.screens.registerScreen({
            id: 'analytics-screen',
            title: 'Analytics Dashboard',
            component: 'AnalyticsComponent'
          });

          // Register action that uses logger
          context.actions.registerAction({
            id: 'track-event',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { logger } = ctx.host as any;
              
              logger.log(`Event tracked: ${JSON.stringify(params)}`);
              
              return { tracked: true, timestamp: Date.now() };
            }
          });

          // Subscribe to events
          context.events.on('data:fetched', (data: unknown) => {
            const { logger } = context.host as any;
            logger.log('Data fetched event received');
          });
        }
      };

      // Register plugins
      runtime.registerPlugin(dataPlugin);
      runtime.registerPlugin(analyticsPlugin);

      // Step 4: Initialize runtime
      await runtime.initialize();
      const context = runtime.getContext();

      // Step 5: Verify host context is immutable (Requirement 1.3)
      expect(Object.isFrozen(context.host)).toBe(true);
      expect(() => {
        (context.host as any).newService = 'value';
      }).toThrow();

      // Step 6: Use introspection to query runtime state (Requirement 3.1, 4.1, 5.1, 6.1)
      
      // Query plugins
      const pluginNames = context.introspect.listPlugins();
      expect(pluginNames).toHaveLength(2);
      expect(pluginNames).toContain('data-plugin');
      expect(pluginNames).toContain('analytics-plugin');

      const dataPluginMeta = context.introspect.getPluginDefinition('data-plugin');
      expect(dataPluginMeta).not.toBeNull();
      expect(dataPluginMeta?.name).toBe('data-plugin');
      expect(dataPluginMeta?.version).toBe('1.0.0');
      expect(Object.isFrozen(dataPluginMeta)).toBe(true);

      // Query actions
      const actionIds = context.introspect.listActions();
      expect(actionIds).toHaveLength(3);
      expect(actionIds).toContain('fetch-users');
      expect(actionIds).toContain('sync-data');
      expect(actionIds).toContain('track-event');

      const fetchUsersMeta = context.introspect.getActionDefinition('fetch-users');
      expect(fetchUsersMeta).not.toBeNull();
      expect(fetchUsersMeta?.id).toBe('fetch-users');
      expect(fetchUsersMeta?.timeout).toBe(5000);
      expect(Object.isFrozen(fetchUsersMeta)).toBe(true);

      // Query screens
      const screenIds = context.introspect.listScreens();
      expect(screenIds).toHaveLength(2);
      expect(screenIds).toContain('data-screen');
      expect(screenIds).toContain('analytics-screen');

      const dataScreenMeta = context.introspect.getScreenDefinition('data-screen');
      expect(dataScreenMeta).not.toBeNull();
      expect(dataScreenMeta?.id).toBe('data-screen');
      expect(dataScreenMeta?.title).toBe('Data Management');
      expect(Object.isFrozen(dataScreenMeta)).toBe(true);

      // Query runtime metadata
      const runtimeMeta = context.introspect.getMetadata();
      expect(runtimeMeta.totalPlugins).toBe(2);
      expect(runtimeMeta.totalActions).toBe(3);
      expect(runtimeMeta.totalScreens).toBe(2);
      expect(runtimeMeta.runtimeVersion).toBe('0.1.0');
      expect(Object.isFrozen(runtimeMeta)).toBe(true);

      // Step 7: Execute actions that use host services
      
      // Execute fetch-users action
      const users = await context.actions.runAction('fetch-users');
      expect(users).toEqual([{ id: 1, name: 'User 1' }]);
      expect(mockCache.get).toHaveBeenCalledWith('users');
      expect(mockLogger.log).toHaveBeenCalledWith('Fetching users from database');
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users');
      expect(mockCache.set).toHaveBeenCalledWith('users', [{ id: 1, name: 'User 1' }]);

      // Execute sync-data action
      const syncResult = await context.actions.runAction('sync-data', { data: 'test' });
      expect(syncResult).toEqual({ created: true });
      expect(mockLogger.log).toHaveBeenCalledWith('Syncing data with external API');
      expect(mockApiClient.post).toHaveBeenCalledWith('/sync', { data: 'test' });

      // Execute track-event action
      const trackResult = await context.actions.runAction('track-event', { event: 'click', target: 'button' });
      expect(trackResult.tracked).toBe(true);
      expect(trackResult.timestamp).toBeDefined();
      expect(mockLogger.log).toHaveBeenCalledWith('Event tracked: {"event":"click","target":"button"}');

      // Step 8: Emit event and verify cross-plugin communication
      context.events.emit('data:fetched', { count: 1 });
      expect(mockLogger.log).toHaveBeenCalledWith('Data fetched event received');

      // Step 9: Test shutdown and cleanup
      await runtime.shutdown();
      expect(runtime.isInitialized()).toBe(false);

      // Verify context is no longer accessible
      expect(() => runtime.getContext()).toThrow('Runtime not initialized');
    });

    it('should handle complex workflow with multiple plugins coordinating via host services', async () => {
      // Create shared state service
      const sharedState = {
        data: new Map<string, any>(),
        set: function(key: string, value: any) {
          this.data.set(key, value);
        },
        get: function(key: string) {
          return this.data.get(key);
        },
        has: function(key: string) {
          return this.data.has(key);
        },
        clear: function() {
          this.data.clear();
        }
      };

      const mockLogger = {
        log: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          state: sharedState,
          logger: mockLogger
        }
      });

      // Plugin 1: Writes data
      const writerPlugin: PluginDefinition = {
        name: 'writer-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'write-data',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { state, logger } = ctx.host as any;
              
              state.set(params.key, params.value);
              logger.log(`Data written: ${params.key} = ${params.value}`);
              
              // Emit event for other plugins
              ctx.events.emit('data:written', { key: params.key });
              
              return { success: true };
            }
          });
        }
      };

      // Plugin 2: Reads data
      const readerPlugin: PluginDefinition = {
        name: 'reader-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'read-data',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { state, logger } = ctx.host as any;
              
              const value = state.get(params.key);
              logger.log(`Data read: ${params.key} = ${value}`);
              
              return { value };
            }
          });
        }
      };

      // Plugin 3: Monitors data changes
      const monitorPlugin: PluginDefinition = {
        name: 'monitor-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          const { logger } = context.host as any;
          
          context.events.on('data:written', (data: any) => {
            logger.log(`Monitor detected data change: ${data.key}`);
          });
        }
      };

      runtime.registerPlugin(writerPlugin);
      runtime.registerPlugin(readerPlugin);
      runtime.registerPlugin(monitorPlugin);
      await runtime.initialize();

      const context = runtime.getContext();

      // Use introspection to verify all plugins are registered
      const plugins = context.introspect.listPlugins();
      expect(plugins).toHaveLength(3);

      // Write data via writer plugin
      await context.actions.runAction('write-data', { key: 'user', value: 'John' });
      
      // Verify logger was called
      expect(mockLogger.log).toHaveBeenCalledWith('Data written: user = John');
      expect(mockLogger.log).toHaveBeenCalledWith('Monitor detected data change: user');

      // Read data via reader plugin
      const result = await context.actions.runAction('read-data', { key: 'user' });
      expect(result.value).toBe('John');
      expect(mockLogger.log).toHaveBeenCalledWith('Data read: user = John');

      // Verify shared state was used
      expect(sharedState.has('user')).toBe(true);
      expect(sharedState.get('user')).toBe('John');

      await runtime.shutdown();
    });

    it('should support workflow with async host services and error handling', async () => {
      const mockAsyncDb = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          if (sql.includes('ERROR')) {
            throw new Error('Database error');
          }
          return { rows: [{ result: 'success' }] };
        })
      };

      const mockLogger = {
        log: vi.fn(),
        error: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          db: mockAsyncDb,
          logger: mockLogger
        }
      });

      const plugin: PluginDefinition = {
        name: 'async-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'safe-query',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { db, logger } = ctx.host as any;
              
              try {
                logger.log(`Executing query: ${params.sql}`);
                const result = await db.query(params.sql);
                logger.log('Query successful');
                return result.rows;
              } catch (error: any) {
                logger.error(`Query failed: ${error.message}`);
                return { error: error.message };
              }
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      // Successful query
      const successResult = await context.actions.runAction('safe-query', { sql: 'SELECT * FROM users' });
      expect(successResult).toEqual([{ result: 'success' }]);
      expect(mockLogger.log).toHaveBeenCalledWith('Executing query: SELECT * FROM users');
      expect(mockLogger.log).toHaveBeenCalledWith('Query successful');

      // Failed query
      const errorResult = await context.actions.runAction('safe-query', { sql: 'SELECT ERROR' });
      expect(errorResult).toEqual({ error: 'Database error' });
      expect(mockLogger.error).toHaveBeenCalledWith('Query failed: Database error');

      await runtime.shutdown();
    });

    it('should verify introspection metadata accuracy throughout workflow', async () => {
      const mockServices = {
        service1: { name: 'Service 1' },
        service2: { name: 'Service 2' }
      };

      runtime = new Runtime({
        hostContext: mockServices
      });

      await runtime.initialize();
      const context = runtime.getContext();

      // Initial state - no resources
      let metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(0);
      expect(metadata.totalPlugins).toBe(0);
      expect(metadata.totalScreens).toBe(0);

      // Register action dynamically
      context.actions.registerAction({
        id: 'dynamic-action-1',
        handler: async () => 'result'
      });

      // Verify metadata updated
      metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(1);

      // Register screen dynamically
      context.screens.registerScreen({
        id: 'dynamic-screen-1',
        title: 'Dynamic Screen',
        component: 'Component'
      });

      // Verify metadata updated
      metadata = context.introspect.getMetadata();
      expect(metadata.totalScreens).toBe(1);

      // Register more resources
      context.actions.registerAction({
        id: 'dynamic-action-2',
        handler: async () => 'result'
      });

      context.screens.registerScreen({
        id: 'dynamic-screen-2',
        title: 'Dynamic Screen 2',
        component: 'Component2'
      });

      // Verify final counts
      metadata = context.introspect.getMetadata();
      expect(metadata.totalActions).toBe(2);
      expect(metadata.totalScreens).toBe(2);

      // Verify lists match counts
      expect(context.introspect.listActions()).toHaveLength(2);
      expect(context.introspect.listScreens()).toHaveLength(2);

      await runtime.shutdown();
    });

    it('should handle workflow with nested host context objects', async () => {
      const mockConfig = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'secret'
          }
        },
        api: {
          baseUrl: 'https://api.example.com',
          endpoints: {
            users: '/users',
            posts: '/posts'
          },
          timeout: 5000
        },
        features: {
          analytics: true,
          logging: true
        }
      };

      runtime = new Runtime({
        hostContext: { config: mockConfig }
      });

      const plugin: PluginDefinition = {
        name: 'config-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'get-db-config',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { config } = ctx.host as any;
              return config.database;
            }
          });

          context.actions.registerAction({
            id: 'get-api-endpoint',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { config } = ctx.host as any;
              return config.api.baseUrl + config.api.endpoints[params.resource];
            }
          });

          context.actions.registerAction({
            id: 'is-feature-enabled',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { config } = ctx.host as any;
              return config.features[params.feature] === true;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      // Access nested database config
      const dbConfig = await context.actions.runAction('get-db-config');
      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.port).toBe(5432);
      expect(dbConfig.credentials.username).toBe('admin');

      // Access nested API config
      const usersEndpoint = await context.actions.runAction('get-api-endpoint', { resource: 'users' });
      expect(usersEndpoint).toBe('https://api.example.com/users');

      const postsEndpoint = await context.actions.runAction('get-api-endpoint', { resource: 'posts' });
      expect(postsEndpoint).toBe('https://api.example.com/posts');

      // Access feature flags
      const analyticsEnabled = await context.actions.runAction('is-feature-enabled', { feature: 'analytics' });
      expect(analyticsEnabled).toBe(true);

      const loggingEnabled = await context.actions.runAction('is-feature-enabled', { feature: 'logging' });
      expect(loggingEnabled).toBe(true);

      await runtime.shutdown();
    });

    it('should support complete workflow with all migration features', async () => {
      // Create comprehensive host context
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        transaction: vi.fn().mockResolvedValue({ commit: vi.fn(), rollback: vi.fn() })
      };

      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      };

      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn()
      };

      const mockMetrics = {
        increment: vi.fn(),
        gauge: vi.fn(),
        timing: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger,
          cache: mockCache,
          metrics: mockMetrics
        }
      });

      // Register comprehensive plugin
      const comprehensivePlugin: PluginDefinition = {
        name: 'comprehensive-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Register multiple screens
          context.screens.registerScreen({
            id: 'dashboard',
            title: 'Dashboard',
            component: 'DashboardComponent'
          });

          context.screens.registerScreen({
            id: 'settings',
            title: 'Settings',
            component: 'SettingsComponent'
          });

          // Register multiple actions
          context.actions.registerAction({
            id: 'load-dashboard',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db, logger, cache, metrics } = ctx.host as any;
              
              const start = Date.now();
              logger.log('Loading dashboard');
              
              // Check cache
              const cached = cache.get('dashboard');
              if (cached) {
                metrics.increment('cache.hit');
                return cached;
              }
              
              // Query database
              metrics.increment('cache.miss');
              const result = await db.query('SELECT * FROM dashboard_data');
              
              // Store in cache
              cache.set('dashboard', result.rows);
              
              // Record timing
              metrics.timing('dashboard.load', Date.now() - start);
              
              return result.rows;
            },
            timeout: 10000
          });

          context.actions.registerAction({
            id: 'update-settings',
            handler: async (params: any, ctx: RuntimeContext) => {
              const { db, logger, cache, metrics } = ctx.host as any;
              
              logger.log(`Updating settings: ${JSON.stringify(params)}`);
              
              // Start transaction
              const tx = await db.transaction();
              
              try {
                await db.query('UPDATE settings SET value = ? WHERE key = ?', [params.value, params.key]);
                await tx.commit();
                
                // Invalidate cache
                cache.delete('settings');
                
                // Record metric
                metrics.increment('settings.updated');
                
                logger.log('Settings updated successfully');
                return { success: true };
              } catch (error: any) {
                await tx.rollback();
                logger.error(`Settings update failed: ${error.message}`);
                metrics.increment('settings.update.failed');
                throw error;
              }
            }
          });

          // Subscribe to events
          context.events.on('user:login', (data: any) => {
            const { logger, metrics } = context.host as any;
            logger.log(`User logged in: ${data.userId}`);
            metrics.increment('user.login');
          });
        }
      };

      runtime.registerPlugin(comprehensivePlugin);
      await runtime.initialize();

      const context = runtime.getContext();

      // Use introspection to verify setup
      const metadata = context.introspect.getMetadata();
      expect(metadata.totalPlugins).toBe(1);
      expect(metadata.totalActions).toBe(2);
      expect(metadata.totalScreens).toBe(2);

      const pluginMeta = context.introspect.getPluginDefinition('comprehensive-plugin');
      expect(pluginMeta?.name).toBe('comprehensive-plugin');
      expect(pluginMeta?.version).toBe('1.0.0');

      // Execute actions
      await context.actions.runAction('load-dashboard');
      expect(mockLogger.log).toHaveBeenCalledWith('Loading dashboard');
      expect(mockCache.get).toHaveBeenCalledWith('dashboard');
      expect(mockMetrics.increment).toHaveBeenCalledWith('cache.miss');
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM dashboard_data');

      await context.actions.runAction('update-settings', { key: 'theme', value: 'dark' });
      expect(mockLogger.log).toHaveBeenCalledWith('Updating settings: {"key":"theme","value":"dark"}');
      expect(mockMetrics.increment).toHaveBeenCalledWith('settings.updated');

      // Emit event
      context.events.emit('user:login', { userId: 'user123' });
      expect(mockLogger.log).toHaveBeenCalledWith('User logged in: user123');
      expect(mockMetrics.increment).toHaveBeenCalledWith('user.login');

      // Verify host context immutability
      expect(Object.isFrozen(context.host)).toBe(true);

      // Shutdown
      await runtime.shutdown();
      expect(runtime.isInitialized()).toBe(false);
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('should handle workflow when host service throws error', async () => {
      const mockDb = {
        query: vi.fn().mockRejectedValue(new Error('Connection failed'))
      };

      const mockLogger = {
        log: vi.fn(),
        error: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger
        }
      });

      const plugin: PluginDefinition = {
        name: 'error-handling-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'query-with-error-handling',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db, logger } = ctx.host as any;
              
              try {
                const result = await db.query('SELECT * FROM users');
                return result;
              } catch (error: any) {
                logger.error(`Query failed: ${error.message}`);
                return { error: error.message };
              }
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      const result = await context.actions.runAction('query-with-error-handling');
      expect(result).toEqual({ error: 'Connection failed' });
      expect(mockLogger.error).toHaveBeenCalledWith('Query failed: Connection failed');

      await runtime.shutdown();
    });

    it('should handle workflow with empty host context', async () => {
      runtime = new Runtime({
        hostContext: {}
      });

      const plugin: PluginDefinition = {
        name: 'empty-context-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          expect(context.host).toBeDefined();
          expect(Object.keys(context.host)).toHaveLength(0);
          expect(Object.isFrozen(context.host)).toBe(true);

          context.actions.registerAction({
            id: 'check-host',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              return {
                hasHost: ctx.host !== undefined,
                isEmpty: Object.keys(ctx.host).length === 0,
                isFrozen: Object.isFrozen(ctx.host)
              };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      const result = await context.actions.runAction('check-host');
      expect(result.hasHost).toBe(true);
      expect(result.isEmpty).toBe(true);
      expect(result.isFrozen).toBe(true);

      await runtime.shutdown();
    });

    it('should handle workflow with action timeout while using host services', async () => {
      const mockDb = {
        query: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return { rows: [] };
        })
      };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const plugin: PluginDefinition = {
        name: 'timeout-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'slow-query',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db } = ctx.host as any;
              const result = await db.query('SELECT * FROM large_table');
              return result.rows;
            },
            timeout: 50 // Will timeout before query completes
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      await expect(context.actions.runAction('slow-query')).rejects.toThrow();

      await runtime.shutdown();
    });
  });
});
