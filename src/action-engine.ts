import type { ActionDefinition, RuntimeContext, Logger, TraceEntry, TraceStatus } from './types.js';
import { ValidationError, DuplicateRegistrationError, ActionTimeoutError, ActionExecutionError, ActionMemoryError } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns heap used in MB, or null in environments without process.memoryUsage */
function heapMb(): number | null {
  try {
    return process.memoryUsage().heapUsed / 1_048_576;
  } catch {
    return null;
  }
}

/** Exponential backoff: attempt 1 → 100ms, 2 → 200ms, 3 → 400ms … */
function backoffMs(attempt: number): number {
  return Math.pow(2, attempt - 1) * 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let runCounter = 0;
function nextRunId(): string {
  return `run_${Date.now()}_${++runCounter}`;
}

/**
 * ActionEngine subsystem for storing and executing actions.
 * Provides O(1) lookup performance using Map-based storage.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4, 11.5, 13.2, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5, 16.2, 16.4, 19.1, 19.2, 19.3, 19.4, 19.5
 */
export class ActionEngine<TConfig = Record<string, unknown>> {
  private actions: Map<string, ActionDefinition<any, any, TConfig>>;
  private context: RuntimeContext<TConfig> | null;
  private logger: Logger;
  private onTrace: ((entry: TraceEntry) => void) | null;

  constructor(logger: Logger, onTrace?: (entry: TraceEntry) => void) {
    this.actions = new Map();
    this.context = null;
    this.logger = logger;
    this.onTrace = onTrace ?? null;
  }

  /**
   * Sets the RuntimeContext for this ActionEngine.
   * This must be called after the RuntimeContext is created during initialization.
   * 
   * @param context - The RuntimeContext to pass to action handlers
   * 
   * Requirement: 6.6
   */
  setContext(context: RuntimeContext<TConfig>): void {
    this.context = context;
  }

  /**
   * Registers an action definition.
   * Rejects duplicate action IDs.
   * Returns an unregister function that removes the action when called.
   * 
   * @param action - The action definition to register
   * @returns A function that unregisters the action when called
   * @throws ValidationError if required fields are missing or invalid
   * @throws DuplicateRegistrationError if an action with the same ID is already registered
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.2, 6.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5, 16.2, 19.1, 19.2, 19.3, 19.4, 19.5
   */
  registerAction<P = unknown, R = unknown>(action: ActionDefinition<P, R, TConfig>): () => void {
    // Validate required fields (Requirements 19.1, 19.2, 19.3, 19.5)
    if (!action.id || typeof action.id !== 'string') {
      throw new ValidationError('Action', 'id');
    }
    if (!action.handler || typeof action.handler !== 'function') {
      throw new ValidationError('Action', 'handler', action.id);
    }

    // Check for duplicate ID (Requirements 6.4, 15.1, 15.2, 15.4, 15.5, 16.2)
    if (this.actions.has(action.id)) {
      throw new DuplicateRegistrationError('Action', action.id);
    }

    // Register the action
    this.actions.set(action.id, action);
    this.logger.debug(`Action "${action.id}" registered successfully`);

    // Return unregister function (Requirements 4.1, 4.2, 4.4, 4.5)
    return () => {
      this.actions.delete(action.id);
    };
  }

  /**
   * Executes an action by ID with optional parameters.
   * Passes the RuntimeContext to the action handler.
   * Handles both synchronous and asynchronous handlers.
   * Wraps handler errors in ActionExecutionError with context.
   * Enforces timeout if specified in action definition.
   * 
   * @param id - The action identifier
   * @param params - Optional parameters to pass to the action handler
   * @returns The result from the action handler
   * @throws Error if the action ID does not exist
   * @throws ActionExecutionError if the handler throws an error
   * @throws ActionTimeoutError if the action exceeds its timeout
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.3, 6.5, 6.6, 6.7, 6.8, 11.1, 11.2, 11.3, 11.4, 11.5, 16.4
   */
  async runAction<P = unknown, R = unknown>(id: string, params?: P): Promise<R> {
    // Check if action exists (Requirements 6.5, 16.4)
    const action = this.actions.get(id);
    if (!action) {
      const pluginName = id.includes(':') ? id.split(':')[0] : 'unknown';
      throw new Error(
        `Action "${id}" not found. ` +
        `If this action belongs to plugin "${pluginName}", ensure the plugin is initialized and ` +
        `"${pluginName}" is listed in the dependencies array of the calling plugin.`
      );
    }

    if (!this.context) {
      throw new Error('RuntimeContext not set in ActionEngine');
    }

    const maxAttempts = 1 + Math.max(0, action.retry ?? 0);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const runId = nextRunId();
      const startedAt = Date.now();
      const heapBefore = heapMb();

      try {
        let result: unknown;

        if (action.timeout) {
          result = await this.runWithTimeout(action, params);
        } else {
          result = await Promise.resolve(action.handler(params, this.context));
        }

        // Memory check (post-execution delta)
        if (action.memoryLimitMb != null && heapBefore !== null) {
          const heapAfter = heapMb()!;
          const deltaMb = heapAfter - heapBefore;
          if (deltaMb > action.memoryLimitMb) {
            const memErr = new ActionMemoryError(id, action.memoryLimitMb, deltaMb);
            this.emitTrace({ runId, actionId: id, input: params, output: undefined,
              status: 'memory', durationMs: Date.now() - startedAt, startedAt,
              error: memErr.message, attempt });
            this.logger.error(`Action "${id}" exceeded memory limit`, memErr);
            throw memErr;
          }
        }

        this.emitTrace({ runId, actionId: id, input: params, output: result,
          status: 'success', durationMs: Date.now() - startedAt, startedAt, attempt });
        return result as R;

      } catch (error) {
        const durationMs = Date.now() - startedAt;

        // Never retry timeout or memory errors
        if (error instanceof ActionTimeoutError) {
          this.emitTrace({ runId, actionId: id, input: params, output: undefined,
            status: 'timeout', durationMs, startedAt, error: (error as Error).message, attempt });
          this.logger.error(`Action "${id}" timed out`, error);
          throw error;
        }
        if (error instanceof ActionMemoryError) {
          throw error; // already emitted above
        }

        lastError = error as Error;
        const status: TraceStatus = 'error';
        this.emitTrace({ runId, actionId: id, input: params, output: undefined,
          status, durationMs, startedAt, error: lastError.message, attempt });

        if (attempt < maxAttempts) {
          const delay = backoffMs(attempt);
          this.logger.warn(`Action "${id}" failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`);
          await sleep(delay);
        } else {
          this.logger.error(`Action "${id}" execution failed`, lastError);
          throw new ActionExecutionError(id, lastError);
        }
      }
    }

    // Unreachable, but satisfies TypeScript
    throw new ActionExecutionError(id, lastError!);
  }

  private emitTrace(entry: TraceEntry): void {
    this.onTrace?.(Object.freeze(entry));
  }

  /**
   * Runs an action handler with a timeout.
   * Uses Promise.race with proper cleanup to ensure timeout behavior is preserved.
   * 
   * @param action - The action definition with timeout
   * @param params - Parameters to pass to the handler
   * @returns The result from the action handler
   * @throws ActionTimeoutError if execution exceeds the timeout
   * 
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   */
  private async runWithTimeout(
    action: ActionDefinition<any, any, TConfig>,
    params: unknown
  ): Promise<unknown> {
    let timeoutId: NodeJS.Timeout | number;

    // Create timeout promise that rejects with ActionTimeoutError
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new ActionTimeoutError(action.id, action.timeout!));
      }, action.timeout);
    });

    // Create handler promise
    const handlerPromise = Promise.resolve(action.handler(params, this.context!));

    try {
      // Race between handler and timeout
      const result = await Promise.race([handlerPromise, timeoutPromise]);
      // Clear timeout if handler completes first
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      // Clear timeout on any error
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  /**
   * Retrieves an action definition by ID.
   * For internal use.
   * 
   * @param id - The action identifier
   * @returns The action definition or null if not found
   * 
   * Requirement: 13.2
   */
  getAction(id: string): ActionDefinition<unknown, unknown, TConfig> | null {
    return this.actions.get(id) ?? null;
  }

  /**
   * Checks whether an action with the given ID is registered.
   * Safe to call at any time without throwing.
   * 
   * @param id - The action identifier
   * @returns true if the action exists
   */
  hasAction(id: string): boolean {
    return this.actions.has(id);
  }

  /**
   * Retrieves all registered action definitions.
   * Returns a copy to prevent external mutation of internal state.
   * 
   * @returns Array of all registered action definitions
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 13.2
   */
  getAllActions(): ActionDefinition<unknown, unknown, TConfig>[] {
    return Array.from(this.actions.values());
  }

  /**
   * Clears all registered actions.
   * Used during shutdown to release resources.
   * 
   * Requirement: 13.5
   */
  clear(): void {
    this.actions.clear();
  }
}
