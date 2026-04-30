/**
 * Minimal performance monitoring utilities for Skeleton Crew Runtime.
 * These utilities are designed to have near-zero overhead when not in use.
 * 
 * Requirements: Minimal core, no new subsystems, environment-neutral
 */

/**
 * Performance monitoring interface - optional and lightweight
 */
export interface PerformanceMonitor {
  startTimer(label: string): () => number;
  recordMetric(name: string, value: number): void;
  getMetrics(): Record<string, number>;
}

/**
 * No-op performance monitor for production use
 */
export class NoOpPerformanceMonitor implements PerformanceMonitor {
  startTimer(): () => number {
    return () => 0;
  }
  
  recordMetric(): void {
    // No-op
  }
  
  getMetrics(): Record<string, number> {
    return {};
  }
}

/**
 * Simple performance monitor for development/debugging
 */
export class SimplePerformanceMonitor implements PerformanceMonitor {
  private metrics: Map<string, number> = new Map();
  
  startTimer(label: string): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(label, duration);
      return duration;
    };
  }
  
  recordMetric(name: string, value: number): void {
    this.metrics.set(name, value);
  }
  
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }
}

/**
 * Creates appropriate performance monitor based on environment
 */
export function createPerformanceMonitor(enabled: boolean = false): PerformanceMonitor {
  return enabled ? new SimplePerformanceMonitor() : new NoOpPerformanceMonitor();
}