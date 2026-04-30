import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PerformanceMonitor,
  NoOpPerformanceMonitor,
  SimplePerformanceMonitor,
  createPerformanceMonitor
} from '../../src/performance.js';

describe('PerformanceMonitor', () => {
  describe('NoOpPerformanceMonitor', () => {
    let monitor: NoOpPerformanceMonitor;

    beforeEach(() => {
      monitor = new NoOpPerformanceMonitor();
    });

    it('should implement PerformanceMonitor interface', () => {
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
      expect(typeof monitor.startTimer).toBe('function');
      expect(typeof monitor.recordMetric).toBe('function');
      expect(typeof monitor.getMetrics).toBe('function');
    });

    it('should return no-op timer function', () => {
      const timer = monitor.startTimer('test-operation');
      expect(typeof timer).toBe('function');

      const duration = timer();
      expect(duration).toBe(0);
    });

    it('should handle multiple timers without interference', () => {
      const timer1 = monitor.startTimer('operation-1');
      const timer2 = monitor.startTimer('operation-2');

      expect(timer1()).toBe(0);
      expect(timer2()).toBe(0);
    });

    it('should ignore recordMetric calls', () => {
      monitor.recordMetric('test-metric', 123.45);
      monitor.recordMetric('another-metric', 67.89);

      // Should not throw and should not store anything
      expect(() => monitor.recordMetric('test', 1)).not.toThrow();
    });

    it('should return empty metrics object', () => {
      monitor.recordMetric('test-metric', 100);

      const metrics = monitor.getMetrics();
      expect(metrics).toEqual({});
      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should have zero overhead for timer operations', () => {
      // Test that timer creation and execution is immediate
      const start = performance.now();

      const timer = monitor.startTimer('performance-test');
      const result = timer();

      const elapsed = performance.now() - start;

      expect(result).toBe(0);
      expect(elapsed).toBeLessThan(1); // Should be nearly instantaneous
    });
  });

  describe('SimplePerformanceMonitor', () => {
    let monitor: SimplePerformanceMonitor;

    beforeEach(() => {
      monitor = new SimplePerformanceMonitor();
    });

    it('should implement PerformanceMonitor interface', () => {
      expect(monitor).toBeInstanceOf(SimplePerformanceMonitor);
      expect(typeof monitor.startTimer).toBe('function');
      expect(typeof monitor.recordMetric).toBe('function');
      expect(typeof monitor.getMetrics).toBe('function');
    });

    it('should measure actual time duration', async () => {
      const timer = monitor.startTimer('async-operation');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = timer();

      expect(duration).toBeGreaterThan(8); // Allow for timing variance
      expect(duration).toBeLessThan(50); // Should be reasonable
    });

    it('should record metrics correctly', () => {
      monitor.recordMetric('test-metric', 123.45);
      monitor.recordMetric('another-metric', 67.89);

      const metrics = monitor.getMetrics();

      expect(metrics['test-metric']).toBe(123.45);
      expect(metrics['another-metric']).toBe(67.89);
    });

    it('should overwrite existing metrics with same name', () => {
      monitor.recordMetric('test-metric', 100);
      monitor.recordMetric('test-metric', 200);

      const metrics = monitor.getMetrics();

      expect(metrics['test-metric']).toBe(200);
      expect(Object.keys(metrics)).toHaveLength(1);
    });

    it('should handle multiple concurrent timers', async () => {
      const timer1 = monitor.startTimer('operation-1');

      await new Promise(resolve => setTimeout(resolve, 5));

      const timer2 = monitor.startTimer('operation-2');

      await new Promise(resolve => setTimeout(resolve, 5));

      const duration1 = timer1();
      const duration2 = timer2();

      expect(duration1).toBeGreaterThan(duration2);
      expect(duration1).toBeGreaterThan(8);
      expect(duration2).toBeGreaterThan(3);

      const metrics = monitor.getMetrics();
      expect(metrics['operation-1']).toBe(duration1);
      expect(metrics['operation-2']).toBe(duration2);
    });

    it('should return timer function that records metric automatically', () => {
      const timer = monitor.startTimer('auto-record-test');

      expect(monitor.getMetrics()['auto-record-test']).toBeUndefined();

      const duration = timer();

      expect(monitor.getMetrics()['auto-record-test']).toBe(duration);
    });

    it('should handle edge cases gracefully', () => {
      // Empty string labels
      const timer1 = monitor.startTimer('');
      const duration1 = timer1();
      expect(typeof duration1).toBe('number');

      // Special characters in labels
      const timer2 = monitor.startTimer('test:operation-with/special\\chars');
      const duration2 = timer2();
      expect(typeof duration2).toBe('number');

      // Zero and negative values
      monitor.recordMetric('zero-metric', 0);
      monitor.recordMetric('negative-metric', -123.45);

      const metrics = monitor.getMetrics();
      expect(metrics['zero-metric']).toBe(0);
      expect(metrics['negative-metric']).toBe(-123.45);
    });

    it('should return immutable metrics snapshot', () => {
      monitor.recordMetric('test-metric', 100);

      const metrics1 = monitor.getMetrics();
      const metrics2 = monitor.getMetrics();

      // Should be different objects
      expect(metrics1).not.toBe(metrics2);

      // But with same content
      expect(metrics1).toEqual(metrics2);

      // Modifying returned object should not affect internal state
      metrics1['new-metric'] = 999;

      const metrics3 = monitor.getMetrics();
      expect(metrics3['new-metric']).toBeUndefined();
    });
  });

  describe('createPerformanceMonitor', () => {
    it('should return NoOpPerformanceMonitor when disabled', () => {
      const monitor = createPerformanceMonitor(false);
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should return SimplePerformanceMonitor when enabled', () => {
      const monitor = createPerformanceMonitor(true);
      expect(monitor).toBeInstanceOf(SimplePerformanceMonitor);
    });

    it('should default to disabled (NoOp) when no parameter provided', () => {
      const monitor = createPerformanceMonitor();
      expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should handle falsy values correctly', () => {
      expect(createPerformanceMonitor(false)).toBeInstanceOf(NoOpPerformanceMonitor);
      expect(createPerformanceMonitor(0 as any)).toBeInstanceOf(NoOpPerformanceMonitor);
      expect(createPerformanceMonitor(null as any)).toBeInstanceOf(NoOpPerformanceMonitor);
      expect(createPerformanceMonitor(undefined as any)).toBeInstanceOf(NoOpPerformanceMonitor);
      expect(createPerformanceMonitor('' as any)).toBeInstanceOf(NoOpPerformanceMonitor);
    });

    it('should handle truthy values correctly', () => {
      expect(createPerformanceMonitor(true)).toBeInstanceOf(SimplePerformanceMonitor);
      expect(createPerformanceMonitor(1 as any)).toBeInstanceOf(SimplePerformanceMonitor);
      expect(createPerformanceMonitor('enabled' as any)).toBeInstanceOf(SimplePerformanceMonitor);
      expect(createPerformanceMonitor({} as any)).toBeInstanceOf(SimplePerformanceMonitor);
    });
  });

  describe('Performance Characteristics', () => {
    it('should have minimal memory footprint for NoOpPerformanceMonitor', () => {
      const monitors = Array.from({ length: 1000 }, () => new NoOpPerformanceMonitor());

      // Should not consume significant memory
      monitors.forEach(monitor => {
        monitor.recordMetric('test', 123);
        const timer = monitor.startTimer('test');
        timer();
      });

      // All should return empty metrics
      monitors.forEach(monitor => {
        expect(monitor.getMetrics()).toEqual({});
      });
    });

    it('should have reasonable memory usage for SimplePerformanceMonitor', () => {
      const monitor = new SimplePerformanceMonitor();

      // Add many metrics
      for (let i = 0; i < 1000; i++) {
        monitor.recordMetric(`metric-${i}`, i);
      }

      const metrics = monitor.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(1000);

      // Should be able to retrieve all metrics
      for (let i = 0; i < 1000; i++) {
        expect(metrics[`metric-${i}`]).toBe(i);
      }
    });

    it('should have consistent timing accuracy', () => {
      vi.useFakeTimers();
      const monitor = new SimplePerformanceMonitor();
      const durations: number[] = [];

      // Measure multiple similar operations using deterministic time
      for (let i = 0; i < 10; i++) {
        const timer = monitor.startTimer(`test-${i}`);
        vi.advanceTimersByTime(10);
        durations.push(timer());
      }

      vi.useRealTimers();

      // With fake timers, durations should be exact
      durations.forEach(duration => {
        expect(duration).toBe(10);
      });
    });
  });
});