import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import { PluginDefinition } from '../../src/types.js';
import { NoOpPerformanceMonitor, SimplePerformanceMonitor } from '../../src/performance.js';

describe('Performance Monitoring Integration', () => {
  let runtime: Runtime;

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdown();
    }
  });

  describe('Runtime Integration', () => {
    it('should use NoOpPerformanceMonitor by default', async () => {
      runtime = new Runtime();
      
      // Access private field for testing (using any cast)
      const monitor = (runtime as any).performanceMonitor;
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should use NoOpPerformanceMonitor when explicitly disabled', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: false
      });
      
      const monitor = (runtime as any).performanceMonitor;
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should use SimplePerformanceMonitor when enabled', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      const monitor = (runtime as any).performanceMonitor;
      expect(monitor).toBeInstanceOf(SimplePerformanceMonitor);
    });

    it('should measure runtime initialization time when monitoring enabled', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      await runtime.initialize();
      
      const monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      const metrics = monitor.getMetrics();
      
      expect(metrics['runtime:initialize']).toBeDefined();
      expect(typeof metrics['runtime:initialize']).toBe('number');
      expect(metrics['runtime:initialize']).toBeGreaterThan(0);
    });

    it('should not record initialization time when monitoring disabled', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: false
      });
      
      await runtime.initialize();
      
      const monitor = (runtime as any).performanceMonitor as NoOpPerformanceMonitor;
      const metrics = monitor.getMetrics();
      
      expect(metrics).toEqual({});
    });

    it('should work with plugin registration and initialization', async () => {
      const testPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (context) => {
          context.actions.registerAction({
            id: 'test:action',
            handler: async () => ({ success: true })
          });
        }
      };

      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      const result = await context.actions.runAction('test:action');
      
      expect(result).toEqual({ success: true });
      
      // Should still have initialization metrics
      const monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      const metrics = monitor.getMetrics();
      expect(metrics['runtime:initialize']).toBeDefined();
    });
  });

  describe('Performance Impact', () => {
    it('should have minimal overhead when disabled', async () => {
      const start = performance.now();
      
      runtime = new Runtime({
        enablePerformanceMonitoring: false
      });
      
      await runtime.initialize();
      
      const elapsed = performance.now() - start;
      
      // Should complete quickly (allowing for test environment variance)
      expect(elapsed).toBeLessThan(100);
    });

    it('should have acceptable overhead when enabled', async () => {
      const start = performance.now();
      
      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      await runtime.initialize();
      
      const elapsed = performance.now() - start;
      
      // Should still complete reasonably quickly
      expect(elapsed).toBeLessThan(200);
    });

    it('should not affect runtime functionality when enabled', async () => {
      const testPlugin: PluginDefinition = {
        name: 'functionality-test',
        version: '1.0.0',
        setup: (context) => {
          context.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          context.actions.registerAction({
            id: 'test:complex-action',
            handler: async (params: { value: number }) => {
              return { result: params.value * 2 };
            }
          });
          
          context.events.on('test:event', (data) => {
            // Event handler
          });
        }
      };

      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      runtime.registerPlugin(testPlugin);
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Test all subsystems work correctly
      const screen = context.screens.getScreen('test-screen');
      expect(screen).toBeDefined();
      expect(screen?.title).toBe('Test Screen');
      
      const actionResult = await context.actions.runAction('test:complex-action', { value: 21 });
      expect(actionResult).toEqual({ result: 42 });
      
      // Events should work
      let eventReceived = false;
      context.events.on('test:event', () => {
        eventReceived = true;
      });
      
      context.events.emit('test:event', { test: true });
      expect(eventReceived).toBe(true);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle undefined enablePerformanceMonitoring option', async () => {
      runtime = new Runtime({
        // enablePerformanceMonitoring is undefined
        logger: undefined
      });
      
      const monitor = (runtime as any).performanceMonitor;
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should work with other runtime options', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: true,
        hostContext: { 
          database: 'mock-db',
          apiKey: 'test-key'
        },
        config: {
          environment: 'test',
          debug: true
        }
      });
      
      await runtime.initialize();
      
      const context = runtime.getContext();
      
      // Performance monitoring should work alongside other features
      const monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      const metrics = monitor.getMetrics();
      expect(metrics['runtime:initialize']).toBeDefined();
      
      // Other features should work
      expect(context.host.database).toBe('mock-db');
      expect(context.config.environment).toBe('test');
    });

    it('should maintain performance monitoring state through runtime lifecycle', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      // Before initialization
      let monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      expect(monitor.getMetrics()).toEqual({});
      
      // After initialization
      await runtime.initialize();
      monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      expect(monitor.getMetrics()['runtime:initialize']).toBeDefined();
      
      // After shutdown
      await runtime.shutdown();
      monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      // Metrics should still be available (not cleared on shutdown)
      expect(monitor.getMetrics()['runtime:initialize']).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with NoOpPerformanceMonitor', async () => {
      // Create multiple runtimes with disabled monitoring
      const runtimes: Runtime[] = [];
      
      for (let i = 0; i < 10; i++) {
        const rt = new Runtime({
          enablePerformanceMonitoring: false
        });
        await rt.initialize();
        runtimes.push(rt);
      }
      
      // All should use NoOp monitors
      runtimes.forEach(rt => {
        const monitor = (rt as any).performanceMonitor;
        expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
        expect(monitor.getMetrics()).toEqual({});
      });
      
      // Cleanup
      for (const rt of runtimes) {
        await rt.shutdown();
      }
    });

    it('should manage memory appropriately with SimplePerformanceMonitor', async () => {
      runtime = new Runtime({
        enablePerformanceMonitoring: true
      });
      
      await runtime.initialize();
      
      const monitor = (runtime as any).performanceMonitor as SimplePerformanceMonitor;
      
      // Add many metrics to test memory usage
      for (let i = 0; i < 100; i++) {
        monitor.recordMetric(`test-metric-${i}`, i);
      }
      
      const metrics = monitor.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(101); // 100 + runtime:initialize
      
      // Should be able to retrieve all metrics
      for (let i = 0; i < 100; i++) {
        expect(metrics[`test-metric-${i}`]).toBe(i);
      }
    });
  });
});