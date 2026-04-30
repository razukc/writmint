import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition, RuntimeContext } from '../../src/types.js';

/**
 * Integration tests for host context in plugins.
 * Verifies that plugins can access host services via context.host
 * and that host context is properly isolated and immutable.
 * 
 * Tests Requirements: 1.1, 1.2, 1.3
 */
describe('Host context in plugins integration tests', () => {
  let runtime: Runtime;

  afterEach(async () => {
    if (runtime?.isInitialized()) {
      await runtime.shutdown();
    }
  });

  describe('Plugin accessing host services', () => {
    it('should allow plugin to access host services via context.host (Requirement 1.1, 1.2)', async () => {
      // Create mock services
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn()
      };

      const mockLogger = {
        log: vi.fn(),
        error: vi.fn()
      };

      const mockCache = {
        get: vi.fn(),
        set: vi.fn()
      };

      // Create runtime with host context
      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger,
          cache: mockCache
        }
      });

      let capturedHost: any = null;

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Plugin accesses host context
          capturedHost = context.host;
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Verify plugin received host context
      expect(capturedHost).toBeDefined();
      expect(capturedHost.db).toBe(mockDb);
      expect(capturedHost.logger).toBe(mockLogger);
      expect(capturedHost.cache).toBe(mockCache);
    });

    it('should allow plugin to use host services in action handlers', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'test' }] })
      };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const plugin: PluginDefinition = {
        name: 'data-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'fetch-data',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              // Action handler uses host service
              const db = ctx.host.db as any;
              const result = await db.query('SELECT * FROM users');
              return result.rows;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const result = await context.actions.runAction('fetch-data');

      expect(result).toEqual([{ id: 1, name: 'test' }]);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should allow plugin to use multiple host services together', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] })
      };

      const mockLogger = {
        log: vi.fn()
      };

      const mockCache = {
        get: vi.fn().mockReturnValue(null),
        set: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger,
          cache: mockCache
        }
      });

      const plugin: PluginDefinition = {
        name: 'comprehensive-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'cached-query',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db, logger, cache } = ctx.host as any;
              
              // Try cache first
              const cached = cache.get('data');
              if (cached) {
                logger.log('Cache hit');
                return cached;
              }

              // Query database
              logger.log('Cache miss, querying database');
              const result = await db.query('SELECT * FROM data');
              
              // Store in cache
              cache.set('data', result.rows);
              
              return result.rows;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const result = await context.actions.runAction('cached-query');

      expect(result).toEqual([{ id: 1 }]);
      expect(mockCache.get).toHaveBeenCalledWith('data');
      expect(mockLogger.log).toHaveBeenCalledWith('Cache miss, querying database');
      expect(mockDb.query).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith('data', [{ id: 1 }]);
    });
  });

  describe('Host context immutability', () => {
    it('should prevent plugin from mutating host context (Requirement 1.3)', async () => {
      const mockDb = { query: vi.fn() };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Attempt to mutate host context should throw
          expect(() => {
            (context.host as any).newKey = 'value';
          }).toThrow();

          expect(() => {
            (context.host as any).db = { different: 'object' };
          }).toThrow();
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
    });

    it('should prevent plugin from mutating host context in action handlers', async () => {
      const mockDb = { query: vi.fn() };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'mutate-attempt',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              // Attempt to mutate should throw
              expect(() => {
                (ctx.host as any).newKey = 'value';
              }).toThrow();

              return 'mutation-prevented';
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const result = await context.actions.runAction('mutate-attempt');

      expect(result).toBe('mutation-prevented');
    });

    it('should verify host context is frozen', async () => {
      const mockDb = { query: vi.fn() };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          // Verify host is frozen
          expect(Object.isFrozen(context.host)).toBe(true);
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
    });
  });

  describe('Multiple plugins accessing same host context', () => {
    it('should allow multiple plugins to access same host services', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      const mockLogger = {
        log: vi.fn()
      };

      runtime = new Runtime({
        hostContext: {
          db: mockDb,
          logger: mockLogger
        }
      });

      const capturedHosts: any[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedHosts.push(context.host);
          
          context.actions.registerAction({
            id: 'plugin1-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db } = ctx.host as any;
              await db.query('SELECT 1');
              return 'plugin1-result';
            }
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedHosts.push(context.host);
          
          context.actions.registerAction({
            id: 'plugin2-action',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { logger } = ctx.host as any;
              logger.log('plugin2 executing');
              return 'plugin2-result';
            }
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();

      const context = runtime.getContext();

      // Execute both actions
      await context.actions.runAction('plugin1-action');
      await context.actions.runAction('plugin2-action');

      // Verify both plugins accessed the same host services
      expect(mockDb.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockLogger.log).toHaveBeenCalledWith('plugin2 executing');

      // Verify both plugins received host context
      expect(capturedHosts).toHaveLength(2);
      expect(capturedHosts[0].db).toBe(mockDb);
      expect(capturedHosts[1].db).toBe(mockDb);
    });

    it('should ensure each plugin gets same host context reference', async () => {
      const mockDb = { query: vi.fn() };

      runtime = new Runtime({
        hostContext: { db: mockDb }
      });

      const capturedHosts: any[] = [];

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedHosts.push(context.host);
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedHosts.push(context.host);
        }
      };

      const plugin3: PluginDefinition = {
        name: 'plugin3',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedHosts.push(context.host);
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      runtime.registerPlugin(plugin3);
      await runtime.initialize();

      // All plugins should receive the same host context
      expect(capturedHosts).toHaveLength(3);
      
      // Verify all have access to the same db service
      expect(capturedHosts[0].db).toBe(mockDb);
      expect(capturedHosts[1].db).toBe(mockDb);
      expect(capturedHosts[2].db).toBe(mockDb);
    });

    it('should allow plugins to coordinate via shared host services', async () => {
      const sharedState = {
        counter: 0,
        increment: function() { this.counter++; },
        getCount: function() { return this.counter; }
      };

      runtime = new Runtime({
        hostContext: { state: sharedState }
      });

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'increment',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { state } = ctx.host as any;
              state.increment();
              return state.getCount();
            }
          });
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'get-count',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { state } = ctx.host as any;
              return state.getCount();
            }
          });
        }
      };

      runtime.registerPlugin(plugin1);
      runtime.registerPlugin(plugin2);
      await runtime.initialize();

      const context = runtime.getContext();

      // Plugin1 increments
      const count1 = await context.actions.runAction('increment');
      expect(count1).toBe(1);

      // Plugin2 can see the change
      const count2 = await context.actions.runAction('get-count');
      expect(count2).toBe(1);

      // Plugin1 increments again
      const count3 = await context.actions.runAction('increment');
      expect(count3).toBe(2);

      // Plugin2 sees updated count
      const count4 = await context.actions.runAction('get-count');
      expect(count4).toBe(2);
    });
  });

  describe('Host context with complex services', () => {
    it('should support host context with nested objects', async () => {
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
          timeout: 5000
        }
      };

      runtime = new Runtime({
        hostContext: { config: mockConfig }
      });

      let capturedConfig: any = null;

      const plugin: PluginDefinition = {
        name: 'config-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          capturedConfig = context.host.config;
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      // Verify nested structure is accessible
      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.database.host).toBe('localhost');
      expect(capturedConfig.database.port).toBe(5432);
      expect(capturedConfig.database.credentials.username).toBe('admin');
      expect(capturedConfig.api.baseUrl).toBe('https://api.example.com');
    });

    it('should support host context with service instances', async () => {
      class DatabaseService {
        constructor(public connectionString: string) {}
        
        async query(sql: string) {
          return { rows: [], sql };
        }
      }

      class CacheService {
        private cache = new Map();
        
        get(key: string) {
          return this.cache.get(key);
        }
        
        set(key: string, value: any) {
          this.cache.set(key, value);
        }
      }

      const dbService = new DatabaseService('postgres://localhost/mydb');
      const cacheService = new CacheService();

      runtime = new Runtime({
        hostContext: {
          db: dbService,
          cache: cacheService
        }
      });

      const plugin: PluginDefinition = {
        name: 'service-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'use-services',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { db, cache } = ctx.host as any;
              
              // Use cache service
              cache.set('key', 'value');
              const cached = cache.get('key');
              
              // Use database service
              const result = await db.query('SELECT * FROM users');
              
              return { cached, dbResult: result };
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const result = await context.actions.runAction('use-services');

      expect(result.cached).toBe('value');
      expect(result.dbResult.sql).toBe('SELECT * FROM users');
    });

    it('should support host context with async services', async () => {
      const mockApiClient = {
        get: vi.fn().mockResolvedValue({ data: { id: 1, name: 'test' } }),
        post: vi.fn().mockResolvedValue({ data: { success: true } })
      };

      runtime = new Runtime({
        hostContext: { api: mockApiClient }
      });

      const plugin: PluginDefinition = {
        name: 'api-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          context.actions.registerAction({
            id: 'fetch-user',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { api } = ctx.host as any;
              const response = await api.get('/users/1');
              return response.data;
            }
          });

          context.actions.registerAction({
            id: 'create-user',
            handler: async (params: unknown, ctx: RuntimeContext) => {
              const { api } = ctx.host as any;
              const response = await api.post('/users', params);
              return response.data;
            }
          });
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();

      const user = await context.actions.runAction('fetch-user');
      expect(user).toEqual({ id: 1, name: 'test' });

      const created = await context.actions.runAction('create-user', { name: 'new user' });
      expect(created).toEqual({ success: true });

      expect(mockApiClient.get).toHaveBeenCalledWith('/users/1');
      expect(mockApiClient.post).toHaveBeenCalledWith('/users', { name: 'new user' });
    });
  });

  describe('Host context edge cases', () => {
    it('should handle empty host context', async () => {
      runtime = new Runtime({
        hostContext: {}
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          expect(context.host).toBeDefined();
          expect(Object.keys(context.host)).toHaveLength(0);
          expect(Object.isFrozen(context.host)).toBe(true);
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
    });

    it('should handle host context with null values', async () => {
      runtime = new Runtime({
        hostContext: {
          service1: null,
          service2: undefined
        }
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          expect(context.host.service1).toBeNull();
          expect(context.host.service2).toBeUndefined();
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
    });

    it('should handle host context with various data types', async () => {
      runtime = new Runtime({
        hostContext: {
          string: 'value',
          number: 42,
          boolean: true,
          array: [1, 2, 3],
          object: { nested: 'value' },
          nullValue: null,
          undefinedValue: undefined
        }
      });

      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context: RuntimeContext) => {
          expect(context.host.string).toBe('value');
          expect(context.host.number).toBe(42);
          expect(context.host.boolean).toBe(true);
          expect(context.host.array).toEqual([1, 2, 3]);
          expect(context.host.object).toEqual({ nested: 'value' });
          expect(context.host.nullValue).toBeNull();
          expect(context.host.undefinedValue).toBeUndefined();
        }
      };

      runtime.registerPlugin(plugin);
      await runtime.initialize();
    });
  });
});
