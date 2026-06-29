// Writmint public entry point (browser).
// The pillars are platform-neutral — no Node-only modules (SHA-256 is a pure
// in-package implementation, not node:crypto) — so the browser surface is
// identical to the Node entry. Kept as a distinct file for the `exports` map
// in package.json and to anchor any future browser/Node divergence.

// The five pillars
export * from './capability-manifest.js';
export * from './permissions.js';
export * from './approval.js';
export * from './replay.js';
export {
  RuntimeError,
  isStructuredError,
  getStructured,
  formatStructuredError,
  ErrorCodes,
  type StructuredError,
  type ErrorCode
} from './errors.js';
