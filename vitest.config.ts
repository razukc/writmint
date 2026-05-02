import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite cache directory (fixes deprecation warning)
  cacheDir: './node_modules/.vite',
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'demo/**', 'example/**'],
    // Performance optimizations
    pool: 'threads',
    poolOptions: {
      // Expose global.gc to test workers. Memory-leak tests force a full GC
      // before measuring heapUsed; without --expose-gc, those calls are no-ops
      // and V8 heuristics leave uncollected garbage in the snapshot, which
      // produces false positives on Node 24 / V8 13.x. Other tests guard with
      // `if (global.gc)` so this is safe.
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
        execArgv: ['--expose-gc']
      }
    },
    // Optimize for CI/local development
    reporter: process.env.CI ? 'dot' : 'default',
    // Reduce memory usage for property tests
    testTimeout: 10000,
    hookTimeout: 10000
  },
  esbuild: {
    // Faster transpilation
    target: 'es2022'
  }
});
