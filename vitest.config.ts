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
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
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
