// Core Runtime entry point
// This file will export the main Runtime class and public types

import { Runtime as CoreRuntime } from './runtime.js';
import { type RuntimeOptions, ConsoleLogger } from './types.js';
import { DirectoryPluginLoader } from './plugin-loader.js';

export * from './runtime.js';
export { CoreRuntime };

/**
 * Node.js Runtime implementation
 * Automatically configures DirectoryPluginLoader for file system access
 */
export class Runtime<TConfig = Record<string, unknown>> extends CoreRuntime<TConfig> {
  constructor(options?: RuntimeOptions<TConfig>) {
    super({
      ...options,
      pluginLoader: options?.pluginLoader ?? new DirectoryPluginLoader(options?.logger ?? new ConsoleLogger())
    });
  }
}

export { ScreenRegistry } from './screen-registry.js';
// Exclude Runtime from types export to avoid conflict with runtime.js export
export {
  ValidationError,
  DuplicateRegistrationError,
  ActionTimeoutError,
  ActionExecutionError,
  ActionMemoryError,
  PluginSwapError,
  ConsoleLogger,
  RuntimeState,
  type PluginDefinition,
  type ScreenDefinition,
  type ActionDefinition,
  type UIProvider,
  type RuntimeContext,
  type RuntimeOptions,
  type ActionMetadata,
  type PluginMetadata,
  type IntrospectionMetadata,
  type IntrospectionAPI,
  type ConfigValidationResult,
  type TraceEntry,
  type TraceStatus,
  type ExecutionRecorder
} from './types.js';
export * from './plugin-loader.js';
export * from './test-utils.js';
export * from './plugins/ConfigPlugin.js';
export * from './plugins/FeatureFlagPlugin.js';
export { ActionEngine } from './action-engine.js';
export { EventBus } from './event-bus.js';
export { PluginRegistry, isNewerVersion } from './plugin-registry.js';
export { ServiceRegistry } from './service-registry.js';
export { UIBridge } from './ui-bridge.js';
export { RuntimeContextImpl } from './runtime-context.js';
export { ExecutionRecorderImpl } from './execution-recorder.js';

export {
  createPerformanceMonitor,
  NoOpPerformanceMonitor,
  SimplePerformanceMonitor
} from './performance.js';

export type {
  PerformanceMonitor
} from './performance.js';

// The five pillars
export * from './capability-manifest.js';
export * from './capabilities.js';
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
