import type { Logger } from './types.js';

/**
 * EventBus subsystem for publish-subscribe event communication.
 * Provides O(1) lookup performance using Map-based storage.
 * Events are scoped to a Runtime Instance and handlers are invoked synchronously.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 13.4, 13.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */
export class EventBus {
  private handlers: Map<string, Set<(data: unknown) => void>>;
  private wildcardHandlers: Map<string, Set<(data: unknown) => void>>; // [NEW] Wildcard support
  private logger: Logger;

  constructor(logger: Logger) {
    this.handlers = new Map();
    this.wildcardHandlers = new Map();
    this.logger = logger;
  }

  /**
   * Emits an event to all registered handlers synchronously.
   * Handlers are invoked in registration order.
   * Handler errors are caught, logged, and do not prevent other handlers from executing.
   * 
   * @param event - The event name
   * @param data - Optional data to pass to handlers
   * 
   * Requirements: 8.2, 8.6, 8.7, 2.1, 2.2, 2.3, 2.4, 2.5
   */
  emit(event: string, data?: unknown): void {
    const handlersToInvoke = new Set<(data: unknown) => void>();

    // 1. Add Exact Match Handlers
    const exactHandlers = this.handlers.get(event);
    if (exactHandlers) {
      exactHandlers.forEach(h => handlersToInvoke.add(h));
    }

    // 2. Add Wildcard Handlers
    // Naive implementation: Iterate all wildcards. 
    // Optimized: Could match specific segments, but start with simple iteration.
    for (const [pattern, handlers] of this.wildcardHandlers) {
      if (this.matchesWildcard(pattern, event)) {
        handlers.forEach(h => handlersToInvoke.add(h));
      }
    }

    if (handlersToInvoke.size === 0) {
      return;
    }

    // Invoke all handlers synchronously
    for (const handler of handlersToInvoke) {
      try {
        handler(data);
      } catch (error) {
        this.logger.error(`Event handler for "${event}" threw error`, error);
      }
    }
  }

  /**
   * Helper to check wildcard matching
   * pattern: 'foo:*' matches 'foo:bar', 'foo:bar:baz'
   */
  private matchesWildcard(pattern: string, event: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return event.startsWith(prefix);
    }
    return pattern === event;
  }

  /**
   * Emits an event to all registered handlers asynchronously.
   * Returns a Promise that resolves when all handlers complete or fail.
   * Uses Promise.allSettled to ensure all handlers are invoked even if some fail.
   * 
   * @param event - The event name
   * @param data - Optional data to pass to handlers
   * @returns Promise that resolves when all handlers complete
   * 
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
   */
  async emitAsync(event: string, data?: unknown): Promise<void> {
    const handlersToInvoke = new Set<(data: unknown) => void>();

    // 1. Add Exact Match Handlers
    const exactHandlers = this.handlers.get(event);
    if (exactHandlers) {
      exactHandlers.forEach(h => handlersToInvoke.add(h));
    }

    // 2. Add Wildcard Handlers
    for (const [pattern, handlers] of this.wildcardHandlers) {
      if (this.matchesWildcard(pattern, event)) {
        handlers.forEach(h => handlersToInvoke.add(h));
      }
    }

    if (handlersToInvoke.size === 0) {
      return;
    }

    // Invoke all handlers asynchronously using Promise.allSettled (Requirements 12.3, 12.4)
    const promises = Array.from(handlersToInvoke).map(handler =>
      Promise.resolve()
        .then(() => handler(data))
        .catch(error => {
          // Log errors from failed handlers (Requirement 12.5)
          this.logger.error(`Async event handler for "${event}" threw error`, error);
        })
    );

    // Wait for all handlers to complete or fail (Requirement 12.4)
    await Promise.allSettled(promises);
  }

  /**
   * Registers an event handler for a specific event.
   * Returns an unsubscribe function that removes the handler when called.
   * 
   * @param event - The event name (can include wildcard *)
   * @param handler - The handler function to invoke when the event is emitted
   * @returns A function that unsubscribes the handler when called
   * 
   * Requirements: 8.3, 8.4, 8.5, 13.4
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    const isWildcard = event.includes('*');
    const targetMap = isWildcard ? this.wildcardHandlers : this.handlers;

    // Get or create the Set of handlers for this event (Requirement 13.4)
    let eventHandlers = targetMap.get(event);
    if (!eventHandlers) {
      eventHandlers = new Set();
      targetMap.set(event, eventHandlers);
    }

    // Add the handler to the Set (maintains insertion order)
    eventHandlers.add(handler);

    // Return unsubscribe function (Requirement 8.4)
    return () => {
      eventHandlers?.delete(handler);

      // Clean up empty Sets to avoid memory leaks
      if (eventHandlers?.size === 0) {
        targetMap.delete(event);
      }
    };
  }

  /**
   * Clears all registered event handlers.
   * Used during shutdown to release resources.
   * 
   * Requirement: 13.5
   */
  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}
