// Writmint public entry point (Node).
// Writmint is the verification layer: declare a CapabilityManifest, scope its
// permissions, harden it before approval, replay its execution, and require a
// hash-bound human approval before it runs. The pillars are self-contained;
// there is no plugin-runtime substrate in this package.

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
