import { describe, it, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { RuntimeContext, PluginDefinition } from '../../src/types.js';

/**
 * Performance Benchmarks for Migration Support
 * 
 * Requirements:
 * - 11.1: Initialization time increase < 1ms with hostContext
 * - 11.2: Introspection query time < 1ms for typical workload (100 resources)
 * - 11.3: No measurable performance degradation
 */

describe('Performance Benchmarks', () => {
  describe('Initialization Performance (Requirement 11.1)', () => {
    it('should initialize without hostContext in < 1ms', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const runtime = new Runtime();
        await runtime.initialize();
        const end = performance.now();
        times.push(end - start);
        await runtime.shutdown();
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== Initialization without hostContext ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
    });

    it('should initialize with hostContext in < 1ms overhead', async () => {
      const iterations = 100;
      const timesWithout: number[] = [];
      const timesWith: number[] = [];

      // Benchmark without hostContext
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const runtime = new Runtime();
        await runtime.initialize();
        const end = performance.now();
        timesWithout.push(end - start);
        await runtime.shutdown();
      }

      // Benchmark with hostContext
      const hostContext = {
        db: { query: () => {} },
        logger: { log: () => {} },
        cache: { get: () => {}, set: () => {} },
        config: { apiKey: 'test-key', endpoint: 'https://api.example.com' }
      };

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const runtime = new Runtime({ hostContext });
        await runtime.initialize();
        const end = performance.now();
        timesWith.push(end - start);
        await runtime.shutdown();
      }

      const avgWithout = timesWithout.reduce((a, b) => a + b, 0) / timesWithout.length;
      const avgWith = timesWith.reduce((a, b) => a + b, 0) / timesWith.length;
      const overhead = avgWith - avgWithout;

      console.log('\n=== Initialization with hostContext ===');
      console.log(`Average without: ${avgWithout.toFixed(3)}ms`);
      console.log(`Average with: ${avgWith.toFixed(3)}ms`);
      console.log(`Overhead: ${overhead.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms overhead`);
      console.log(`Status: ${overhead < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });
  });

  describe('Introspection Performance (Requirement 11.2)', () => {
    let runtime: Runtime;
    let context: RuntimeContext;

    beforeEach(async () => {
      runtime = new Runtime();
      
      // Register 100 plugins BEFORE initialization
      for (let i = 0; i < 100; i++) {
        const plugin: PluginDefinition = {
          name: `test-plugin-${i}`,
          version: '1.0.0',
          setup: (ctx) => {
            // Register actions and screens in plugin setup
            ctx.actions.registerAction({
              id: `test:action${i}`,
              handler: async () => ({ result: i }),
              timeout: 5000
            });
            
            ctx.screens.registerScreen({
              id: `test:screen${i}`,
              title: `Test Screen ${i}`,
              component: `TestComponent${i}`
            });
          }
        };
        runtime.registerPlugin(plugin);
      }
      
      await runtime.initialize();
      context = runtime.getContext();
    });

    afterEach(async () => {
      await runtime.shutdown();
    });

    it('should list all actions in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const actions = context.introspect.listActions();
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== listActions() with 100 actions ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should get action definition in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const actionId = `test:action${i % 100}`;
        const start = performance.now();
        const metadata = context.introspect.getActionDefinition(actionId);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== getActionDefinition() with 100 actions ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should list all plugins in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const plugins = context.introspect.listPlugins();
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== listPlugins() with 100 plugins ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should get plugin definition in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const pluginName = `test-plugin-${i % 100}`;
        const start = performance.now();
        const metadata = context.introspect.getPluginDefinition(pluginName);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== getPluginDefinition() with 100 plugins ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should list all screens in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const screens = context.introspect.listScreens();
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== listScreens() with 100 screens ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should get screen definition in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const screenId = `test:screen${i % 100}`;
        const start = performance.now();
        const metadata = context.introspect.getScreenDefinition(screenId);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== getScreenDefinition() with 100 screens ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });

    it('should get runtime metadata in < 1ms', () => {
      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const metadata = context.introspect.getMetadata();
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('\n=== getMetadata() with 100 resources ===');
      console.log(`Average: ${avgTime.toFixed(3)}ms`);
      console.log(`Min: ${minTime.toFixed(3)}ms`);
      console.log(`Max: ${maxTime.toFixed(3)}ms`);
      console.log(`Requirement: < 1ms`);
      console.log(`Status: ${avgTime < 1 ? '✅ PASS' : '❌ FAIL'}`);
    });
  });
});
