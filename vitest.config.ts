import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite cache directory (fixes deprecation warning)
  cacheDir: './node_modules/.vite',
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'demo/**', 'example/**'],
    // Performance optimizations
    pool: 'threads',
    // Vitest 4 removed poolOptions; maxWorkers is now top-level.
    //
    // `--expose-gc` used to live in poolOptions.threads.execArgv to give
    // memory-leak tests access to `global.gc`. Node 22+ rejects that flag
    // on worker_threads (`ERR_WORKER_INVALID_EXEC_ARGV`), so we drop it
    // here. The memory-leak tests already guard every gc call with
    // `if (global.gc)` and the threshold accounts for the noise the missing
    // gc introduces (see tests/integration/memory-leak.test.ts:214). If a
    // future regression actually retains memory, raise the threshold or
    // run that file standalone with `node --expose-gc node_modules/.bin/vitest`.
    maxWorkers: 4,
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
