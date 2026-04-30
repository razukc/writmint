import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  NoOpPerformanceMonitor,
  SimplePerformanceMonitor,
  createPerformanceMonitor
} from '../../src/performance.js';

describe('Performance Monitoring Property Tests', () => {
  describe('NoOpPerformanceMonitor Properties', () => {
    let monitor: NoOpPerformanceMonitor;

    beforeEach(() => {
      monitor = new NoOpPerformanceMonitor();
    });

    it('Property: startTimer always returns function that returns 0', () => {
      fc.assert(fc.property(
        fc.string(),
        (label) => {
          const timer = monitor.startTimer(label);
          expect(typeof timer).toBe('function');
          expect(timer()).toBe(0);
        }
      ), { numRuns: 100 });
    });

    it('Property: recordMetric never affects getMetrics output', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          name: fc.string(),
          value: fc.float()
        })),
        (metrics) => {
          // Record all metrics
          metrics.forEach(({ name, value }) => {
            monitor.recordMetric(name, value);
          });
          
          // Should always return empty object
          expect(monitor.getMetrics()).toEqual({});
        }
      ), { numRuns: 100 });
    });

    it('Property: getMetrics always returns empty object regardless of operations', () => {
      fc.assert(fc.property(
        fc.array(fc.oneof(
          fc.record({ type: fc.constant('timer'), label: fc.string() }),
          fc.record({ type: fc.constant('metric'), name: fc.string(), value: fc.float() })
        )),
        (operations) => {
          // Perform random operations
          operations.forEach(op => {
            if (op.type === 'timer') {
              const timer = monitor.startTimer((op as any).label);
              timer();
            } else {
              monitor.recordMetric((op as any).name, (op as any).value);
            }
          });
          
          expect(monitor.getMetrics()).toEqual({});
        }
      ), { numRuns: 100 });
    });

    it('Property: timer functions are independent and always return 0', () => {
      fc.assert(fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (labels) => {
          const timers = labels.map(label => monitor.startTimer(label));
          
          // All timers should return 0 regardless of order of execution
          const results = timers.map(timer => timer());
          
          expect(results.every(result => result === 0)).toBe(true);
        }
      ), { numRuns: 100 });
    });
  });

  describe('SimplePerformanceMonitor Properties', () => {
    let monitor: SimplePerformanceMonitor;

    beforeEach(() => {
      monitor = new SimplePerformanceMonitor();
    });

    it('Property: recordMetric stores exact values', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          name: fc.string().filter(s => s.length > 0), // Non-empty strings
          value: fc.float({ noNaN: true })
        }), { maxLength: 50 }),
        (metricsData) => {
          // Record all metrics
          metricsData.forEach(({ name, value }) => {
            monitor.recordMetric(name, value);
          });
          
          const retrievedMetrics = monitor.getMetrics();
          
          // Check that all unique metrics are stored correctly
          const uniqueMetrics = new Map(metricsData.map(m => [m.name, m.value]));
          
          uniqueMetrics.forEach((expectedValue, name) => {
            expect(retrievedMetrics[name]).toBe(expectedValue);
          });
        }
      ), { numRuns: 100 });
    });

    it('Property: later recordMetric calls overwrite earlier ones for same name', () => {
      fc.assert(fc.property(
        fc.string().filter(s => s.length > 0),
        fc.array(fc.float({ noNaN: true }), { minLength: 2, maxLength: 10 }),
        (metricName, values) => {
          // Record multiple values for same metric name
          values.forEach(value => {
            monitor.recordMetric(metricName, value);
          });
          
          const metrics = monitor.getMetrics();
          
          // Should contain only the last value
          expect(metrics[metricName]).toBe(values[values.length - 1]);
        }
      ), { numRuns: 100 });
    });

    it('Property: startTimer returns function that measures duration', () => {
      fc.assert(fc.property(
        fc.string().filter(s => s.trim().length > 0),
        (label) => {
          const timer = monitor.startTimer(label);
          
          // Timer should be a function
          expect(typeof timer).toBe('function');
          
          // Calling timer should return a number
          const duration = timer();
          expect(typeof duration).toBe('number');
          expect(Number.isFinite(duration)).toBe(true);
          expect(duration).toBeGreaterThanOrEqual(0);
          
          // Should be recorded in metrics
          const metrics = monitor.getMetrics();
          expect(metrics[label]).toBe(duration);
        }
      ), { numRuns: 100 });
    });

    it('Property: getMetrics returns immutable snapshots', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          name: fc.string().filter(s => s.length > 0),
          value: fc.float({ noNaN: true })
        }), { maxLength: 20 }),
        (initialMetrics) => {
          // Set up initial metrics
          initialMetrics.forEach(({ name, value }) => {
            monitor.recordMetric(name, value);
          });
          
          const snapshot1 = monitor.getMetrics();
          const snapshot2 = monitor.getMetrics();
          
          // Snapshots should be different objects
          expect(snapshot1).not.toBe(snapshot2);
          
          // But have same content
          expect(snapshot1).toEqual(snapshot2);
          
          // Modifying snapshot should not affect internal state
          if (Object.keys(snapshot1).length > 0) {
            const firstKey = Object.keys(snapshot1)[0];
            snapshot1[firstKey] = 999999;
            
            const snapshot3 = monitor.getMetrics();
            expect(snapshot3[firstKey]).not.toBe(999999);
          }
          
          // Adding new properties should not affect internal state
          snapshot1['__test_property__'] = 'should_not_persist';
          
          const snapshot4 = monitor.getMetrics();
          expect(snapshot4['__test_property__']).toBeUndefined();
        }
      ), { numRuns: 100 });
    });

    it('Property: multiple timers work independently', () => {
      fc.assert(fc.property(
        fc.array(fc.string().filter(s => s.trim().length > 0), { minLength: 2, maxLength: 5 }),
        (labels) => {
          // Ensure unique labels by adding index
          const uniqueLabels = [...new Set(labels)].map((label, index) => `${label.trim()}-${index}`);
          
          // Start all timers
          const timers = uniqueLabels.map(label => ({
            label,
            timer: monitor.startTimer(label)
          }));
          
          // Stop all timers
          const results = timers.map(({ label, timer }) => ({
            label,
            duration: timer()
          }));
          
          // Each timer should return a valid duration
          results.forEach(({ label, duration }) => {
            expect(typeof duration).toBe('number');
            expect(Number.isFinite(duration)).toBe(true);
            expect(duration).toBeGreaterThanOrEqual(0);
            
            // Should be recorded in metrics
            const metrics = monitor.getMetrics();
            expect(metrics[label]).toBe(duration);
          });
          
          // All labels should be unique in metrics
          const metrics = monitor.getMetrics();
          const metricKeys = Object.keys(metrics).filter(key => uniqueLabels.includes(key));
          expect(metricKeys).toHaveLength(uniqueLabels.length);
        }
      ), { numRuns: 50 });
    });
  });

  describe('createPerformanceMonitor Properties', () => {
    it('Property: returns NoOpPerformanceMonitor for all falsy values', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant(false),
          fc.constant(0),
          fc.constant(''),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (falsyValue) => {
          const monitor = createPerformanceMonitor(falsyValue as boolean);
          expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
        }
      ), { numRuns: 100 });
    });

    it('Property: returns SimplePerformanceMonitor for all truthy values', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant(true),
          fc.integer({ min: 1 }),
          fc.string({ minLength: 1 }),
          fc.object(),
          fc.array(fc.anything(), { minLength: 1 })
        ),
        (truthyValue) => {
          const monitor = createPerformanceMonitor(truthyValue as boolean);
          expect(monitor).toBeInstanceOf(SimplePerformanceMonitor);
        }
      ), { numRuns: 100 });
    });

    it('Property: created monitors behave according to their type', () => {
      fc.assert(fc.property(
        fc.boolean(),
        fc.string(),
        fc.float({ noNaN: true }),
        (enabled, metricName, metricValue) => {
          const monitor = createPerformanceMonitor(enabled);
          
          monitor.recordMetric(metricName, metricValue);
          const metrics = monitor.getMetrics();
          
          if (enabled) {
            // SimplePerformanceMonitor should store the metric
            expect(monitor).toBeInstanceOf(SimplePerformanceMonitor);
            expect(metrics[metricName]).toBe(metricValue);
          } else {
            // NoOpPerformanceMonitor should ignore the metric
            expect(monitor).toBeInstanceOf(NoOpPerformanceMonitor);
            expect(metrics).toEqual({});
          }
        }
      ), { numRuns: 100 });
    });
  });

  describe('Performance Invariants', () => {
    it('Property: NoOp operations complete in constant time', () => {
      fc.assert(fc.property(
        fc.array(fc.string(), { maxLength: 100 }),
        (labels) => {
          const monitor = new NoOpPerformanceMonitor();
          
          const start = performance.now();
          
          // Perform many operations
          labels.forEach(label => {
            monitor.recordMetric(label, Math.random());
            const timer = monitor.startTimer(label);
            timer();
          });
          
          const elapsed = performance.now() - start;
          
          // Should complete very quickly regardless of number of operations
          expect(elapsed).toBeLessThan(10); // 10ms should be more than enough
        }
      ), { numRuns: 50 });
    });

    it('Property: SimplePerformanceMonitor memory usage scales linearly with unique metrics', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 100 }),
        (numMetrics) => {
          const monitor = new SimplePerformanceMonitor();
          
          // Add exactly numMetrics unique metrics
          for (let i = 0; i < numMetrics; i++) {
            monitor.recordMetric(`metric-${i}`, i);
          }
          
          const metrics = monitor.getMetrics();
          
          // Should store exactly the number of unique metrics
          expect(Object.keys(metrics)).toHaveLength(numMetrics);
          
          // All metrics should be present and correct
          for (let i = 0; i < numMetrics; i++) {
            expect(metrics[`metric-${i}`]).toBe(i);
          }
        }
      ), { numRuns: 50 });
    });

    it('Property: timer functions are consistent', () => {
      fc.assert(fc.property(
        fc.string().filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 5 }),
        (label, numCalls) => {
          const monitor = new SimplePerformanceMonitor(); // Create fresh monitor for each test
          let lastDuration = 0;
          
          for (let i = 0; i < numCalls; i++) {
            const timer = monitor.startTimer(label);
            lastDuration = timer();
            
            expect(typeof lastDuration).toBe('number');
            expect(Number.isFinite(lastDuration)).toBe(true);
            expect(lastDuration).toBeGreaterThanOrEqual(0);
          }
          
          // Only the last duration should be stored (overwrite behavior)
          const metrics = monitor.getMetrics();
          expect(metrics[label]).toBe(lastDuration);
          
          // Should only have one entry for this label
          const labelKeys = Object.keys(metrics).filter(key => key === label);
          expect(labelKeys).toHaveLength(1);
        }
      ), { numRuns: 50 });
    });
  });
});