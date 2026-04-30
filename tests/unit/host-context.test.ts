import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { Logger, PluginDefinition } from '../../src/types.js';

describe('Host Context Injection', () => {
  describe('Injection with valid context', () => {
    it('should inject host context into runtime', async () => {
      // Requirement: 1.1
      const hostContext = {
        db: { query: vi.fn() },
        logger: { log: vi.fn() },
        cache: { get: vi.fn(), set: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify host context is accessible
      expect(context.host).toBeDefined();
      expect(context.host.db).toBeDefined();
      expect(context.host.logger).toBeDefined();
      expect(context.host.cache).toBeDefined();
    });

    it('should pass host context to plugins via RuntimeContext', async () => {
      // Requirements: 1.1, 1.2
      const hostContext = {
        db: { query: vi.fn() },
        apiClient: { fetch: vi.fn() }
      };

      let capturedHost: any = null;

      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          capturedHost = context.host;
        }
      };

      const runtime = new Runtime({ hostContext });
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();

      // Verify plugin received host context
      expect(capturedHost).not.toBeNull();
      expect(capturedHost.db).toBeDefined();
      expect(capturedHost.apiClient).toBeDefined();
    });

    it('should allow plugins to access host services', async () => {
      // Requirements: 1.1, 1.2
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const hostContext = {
        db: { query: mockQuery }
      };

      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          // Plugin can access host services
          const db = context.host.db as any;
          expect(db).toBeDefined();
          expect(db.query).toBeDefined();
        }
      };

      const runtime = new Runtime({ hostContext });
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();
    });
  });

  describe('Default empty object when no hostContext provided', () => {
    it('should default to empty object when hostContext not provided', async () => {
      // Requirement: 1.5
      const runtime = new Runtime();
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify host exists and is empty
      expect(context.host).toBeDefined();
      expect(Object.keys(context.host)).toHaveLength(0);
    });

    it('should default to empty object when RuntimeOptions is empty', async () => {
      // Requirement: 1.5
      const runtime = new Runtime({});
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify host exists and is empty
      expect(context.host).toBeDefined();
      expect(Object.keys(context.host)).toHaveLength(0);
    });

    it('should provide frozen empty object when no hostContext', async () => {
      // Requirements: 1.3, 1.4, 1.5
      const runtime = new Runtime();
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify host is frozen
      expect(Object.isFrozen(context.host)).toBe(true);
      
      // Verify mutation throws in strict mode
      expect(() => {
        (context.host as any).newKey = 'value';
      }).toThrow();
    });
  });

  describe('Validation warnings for large objects', () => {
    it('should warn about objects larger than 1MB', async () => {
      // Requirement: 2.1
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      // Create a large object (> 1MB)
      const largeArray = new Array(200000).fill('x'.repeat(10));
      const hostContext = {
        largeData: largeArray
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalled();
      const warnCall = (mockLogger.warn as any).mock.calls[0][0];
      expect(warnCall).toContain('largeData');
      expect(warnCall).toContain('large');
      expect(warnCall).toContain('bytes');
    });

    it('should include key name and size in warning', async () => {
      // Requirement: 2.1
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      // Create a large object
      const largeArray = new Array(200000).fill('x'.repeat(10));
      const hostContext = {
        myLargeKey: largeArray
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify warning includes key name
      expect(mockLogger.warn).toHaveBeenCalled();
      const warnCall = (mockLogger.warn as any).mock.calls[0][0];
      expect(warnCall).toContain('myLargeKey');
      expect(warnCall).toMatch(/\d+ bytes/);
    });

    it('should not warn about small objects', async () => {
      // Requirement: 2.1
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        db: { query: vi.fn() },
        config: { apiKey: 'test-key' }
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify no warnings for small objects
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Validation warnings for function values', () => {
    it('should warn about function values', async () => {
      // Requirement: 2.2
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        myFunction: () => 'test'
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify warnings were logged (both serialization and function warnings)
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      
      // First warning is about serialization failure
      const firstWarnCall = (mockLogger.warn as any).mock.calls[0][0];
      expect(firstWarnCall).toContain('myFunction');
      expect(firstWarnCall).toContain('could not be serialized');
      
      // Second warning is about function value
      const secondWarnCall = (mockLogger.warn as any).mock.calls[1][0];
      expect(secondWarnCall).toContain('myFunction');
      expect(secondWarnCall).toContain('function');
    });

    it('should suggest wrapping functions in objects', async () => {
      // Requirement: 2.2
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        queryDb: () => {}
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify warning suggests wrapping (second warning call)
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      
      const functionWarnCall = (mockLogger.warn as any).mock.calls[1][0];
      expect(functionWarnCall).toContain('wrapping');
    });

    it('should not warn about functions inside objects', async () => {
      // Requirement: 2.2
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        db: { query: () => {} }  // Function wrapped in object
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Verify no warnings for wrapped functions
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Validation does not modify context', () => {
    it('should not modify context during validation', async () => {
      // Requirement: 2.4
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const originalContext = {
        db: { query: vi.fn() },
        largeData: new Array(200000).fill('x'.repeat(10)),
        myFunction: () => 'test'
      };

      // Create a deep copy to compare
      const contextCopy = JSON.parse(JSON.stringify({
        db: { query: 'function' },
        largeData: originalContext.largeData
      }));

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext: originalContext 
      });

      // Verify context still has all original properties
      expect(originalContext.db).toBeDefined();
      expect(originalContext.largeData).toBeDefined();
      expect(originalContext.myFunction).toBeDefined();
      
      // Verify structure is unchanged (comparing serializable parts)
      expect(originalContext.largeData).toEqual(contextCopy.largeData);
    });

    it('should preserve all context properties after validation', async () => {
      // Requirement: 2.4
      const hostContext = {
        db: { query: vi.fn() },
        cache: { get: vi.fn(), set: vi.fn() },
        logger: { log: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify all properties are still accessible
      expect(context.host.db).toBeDefined();
      expect(context.host.cache).toBeDefined();
      expect(context.host.logger).toBeDefined();
    });
  });

  describe('Initialization succeeds despite warnings', () => {
    it('should initialize successfully with large objects', async () => {
      // Requirement: 2.3
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const largeArray = new Array(200000).fill('x'.repeat(10));
      const hostContext = {
        largeData: largeArray
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Should not throw
      await expect(runtime.initialize()).resolves.not.toThrow();
      
      // Verify warning was logged but initialization succeeded
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(runtime.isInitialized()).toBe(true);
    });

    it('should initialize successfully with function values', async () => {
      // Requirement: 2.3
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        myFunction: () => 'test'
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Should not throw
      await expect(runtime.initialize()).resolves.not.toThrow();
      
      // Verify warning was logged but initialization succeeded
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(runtime.isInitialized()).toBe(true);
    });

    it('should initialize successfully with multiple validation issues', async () => {
      // Requirement: 2.3
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const largeArray = new Array(200000).fill('x'.repeat(10));
      const hostContext = {
        largeData: largeArray,
        myFunction: () => 'test',
        anotherFunction: () => 'test2'
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });

      // Should not throw despite multiple warnings
      await expect(runtime.initialize()).resolves.not.toThrow();
      
      // Verify multiple warnings were logged
      // 1 for large data, 2 for serialization failures (functions), 2 for function warnings
      expect(mockLogger.warn).toHaveBeenCalledTimes(5);
      expect(runtime.isInitialized()).toBe(true);
    });

    it('should allow plugins to access context despite validation warnings', async () => {
      // Requirements: 2.3, 1.2
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const hostContext = {
        myFunction: () => 'test',
        db: { query: vi.fn() }
      };

      let pluginAccessedHost = false;

      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          // Plugin should be able to access host despite warnings
          expect(context.host.myFunction).toBeDefined();
          expect(context.host.db).toBeDefined();
          pluginAccessedHost = true;
        }
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext 
      });
      runtime.registerPlugin(testPlugin);
      
      await runtime.initialize();
      
      // Verify plugin executed and accessed host
      expect(pluginAccessedHost).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Host context immutability', () => {
    it('should return frozen host context', async () => {
      // Requirements: 1.3, 1.4
      const hostContext = {
        db: { query: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Verify host is frozen
      expect(Object.isFrozen(context.host)).toBe(true);
    });

    it('should throw error when attempting to mutate host context', async () => {
      // Requirements: 1.3, 1.4
      const hostContext = {
        db: { query: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Attempt to mutate should throw
      expect(() => {
        (context.host as any).newKey = 'value';
      }).toThrow();
    });

    it('should prevent mutation of existing properties', async () => {
      // Requirements: 1.3, 1.4
      const hostContext = {
        db: { query: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Attempt to modify existing property should throw
      expect(() => {
        (context.host as any).db = { different: 'value' };
      }).toThrow();
    });

    it('should prevent deletion of properties', async () => {
      // Requirements: 1.3, 1.4
      const hostContext = {
        db: { query: vi.fn() }
      };

      const runtime = new Runtime({ hostContext });
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Attempt to delete property should throw
      expect(() => {
        delete (context.host as any).db;
      }).toThrow();
    });
  });

  describe('Fast path for empty context', () => {
    it('should skip validation for empty context', async () => {
      // Requirement: 2.1 (optimization)
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const runtime = new Runtime({ 
        logger: mockLogger,
        hostContext: {} 
      });

      // Verify no validation warnings for empty context
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Isolation between runtime instances', () => {
    it('should isolate host context between different runtime instances', async () => {
      // Requirements: 1.3, 1.4
      const hostContext1 = {
        db: { name: 'database1', query: vi.fn() },
        apiKey: 'key-1'
      };

      const hostContext2 = {
        db: { name: 'database2', query: vi.fn() },
        apiKey: 'key-2'
      };

      const runtime1 = new Runtime({ hostContext: hostContext1 });
      const runtime2 = new Runtime({ hostContext: hostContext2 });

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Verify each runtime has its own isolated context
      expect((context1.host.db as any).name).toBe('database1');
      expect((context2.host.db as any).name).toBe('database2');
      expect(context1.host.apiKey).toBe('key-1');
      expect(context2.host.apiKey).toBe('key-2');

      // Verify they are different objects
      expect(context1.host).not.toBe(context2.host);
    });

    it('should prevent cross-contamination between runtime instances', async () => {
      // Requirements: 1.3, 1.4
      const sharedObject = { value: 'original' };
      
      const hostContext1 = {
        shared: sharedObject,
        unique1: 'value1'
      };

      const hostContext2 = {
        shared: sharedObject,
        unique2: 'value2'
      };

      const runtime1 = new Runtime({ hostContext: hostContext1 });
      const runtime2 = new Runtime({ hostContext: hostContext2 });

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Verify each runtime has its own properties
      expect(context1.host.unique1).toBe('value1');
      expect(context1.host.unique2).toBeUndefined();
      expect(context2.host.unique2).toBe('value2');
      expect(context2.host.unique1).toBeUndefined();

      // Both should see the shared object
      expect((context1.host.shared as any).value).toBe('original');
      expect((context2.host.shared as any).value).toBe('original');
    });

    it('should allow plugins in different runtimes to access their own host context', async () => {
      // Requirements: 1.1, 1.2, 1.3, 1.4
      const hostContext1 = { service: 'service1' };
      const hostContext2 = { service: 'service2' };

      let capturedHost1: any = null;
      let capturedHost2: any = null;

      const plugin1: PluginDefinition = {
        name: 'plugin1',
        version: '1.0.0',
        setup: (context) => {
          capturedHost1 = context.host;
        }
      };

      const plugin2: PluginDefinition = {
        name: 'plugin2',
        version: '1.0.0',
        setup: (context) => {
          capturedHost2 = context.host;
        }
      };

      const runtime1 = new Runtime({ hostContext: hostContext1 });
      const runtime2 = new Runtime({ hostContext: hostContext2 });

      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);

      await runtime1.initialize();
      await runtime2.initialize();

      // Verify each plugin sees only its runtime's context
      expect(capturedHost1.service).toBe('service1');
      expect(capturedHost2.service).toBe('service2');
      expect(capturedHost1).not.toBe(capturedHost2);
    });

    it('should maintain isolation even with identical context values', async () => {
      // Requirements: 1.3, 1.4
      const hostContext = {
        db: { query: vi.fn() },
        config: { apiKey: 'test' }
      };

      const runtime1 = new Runtime({ hostContext });
      const runtime2 = new Runtime({ hostContext });

      await runtime1.initialize();
      await runtime2.initialize();

      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();

      // Even though they share the same source context,
      // each runtime should return its own frozen copy
      expect(context1.host).not.toBe(context2.host);
      
      // Both should be frozen
      expect(Object.isFrozen(context1.host)).toBe(true);
      expect(Object.isFrozen(context2.host)).toBe(true);

      // Mutations to one should not affect the other
      expect(() => {
        (context1.host as any).newKey = 'value';
      }).toThrow();

      expect(() => {
        (context2.host as any).newKey = 'value';
      }).toThrow();
    });
  });
});
