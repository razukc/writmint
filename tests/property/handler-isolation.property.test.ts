import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { EventBus } from '../../src/event-bus.js';
import { ConsoleLogger } from '../../src/types.js';

/**
 * Property 1: Handler Isolation
 * 
 * Feature: runtime-hardening, Property 1: Handler Isolation
 * 
 * For any event with multiple handlers, if one handler throws an error,
 * all other handlers should still be invoked
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */
describe('Property 1: Handler Isolation', () => {
  it('should invoke all handlers even when some throw errors', () => {
    fc.assert(
      fc.property(
        // Generate a random event name
        fc.string({ minLength: 1, maxLength: 20 }),
        // Generate a random number of handlers (2-10)
        fc.integer({ min: 2, max: 10 }),
        // Generate which handlers should throw (at least one, but not all)
        fc.array(fc.boolean(), { minLength: 2, maxLength: 10 }),
        (eventName, handlerCount, throwFlags) => {
          // Ensure throwFlags matches handlerCount
          const shouldThrow = throwFlags.slice(0, handlerCount);
          
          // Ensure at least one throws and at least one doesn't
          const hasThrowingHandler = shouldThrow.some(t => t);
          const hasNonThrowingHandler = shouldThrow.some(t => !t);
          
          fc.pre(hasThrowingHandler && hasNonThrowingHandler);
          
          // Track which handlers were invoked
          const invoked: boolean[] = new Array(handlerCount).fill(false);
          
          // Create EventBus with logger
          const logger = new ConsoleLogger();
          const eventBus = new EventBus(logger);
          
          // Register handlers
          for (let i = 0; i < handlerCount; i++) {
            const index = i; // Capture the current value of i
            eventBus.on(eventName, () => {
              invoked[index] = true;
              if (shouldThrow[index]) {
                throw new Error(`Handler ${index} error`);
              }
            });
          }
          
          // Emit the event
          eventBus.emit(eventName, {});
          
          // Verify all handlers were invoked
          expect(invoked.every(v => v)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should invoke all handlers in order even with errors', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 3, max: 8 }),
        (eventName, handlerCount) => {
          // Track invocation order
          const invocationOrder: number[] = [];
          
          const logger = new ConsoleLogger();
          const eventBus = new EventBus(logger);
          
          // Register handlers, make every other one throw
          for (let i = 0; i < handlerCount; i++) {
            const index = i; // Capture the current value of i
            eventBus.on(eventName, () => {
              invocationOrder.push(index);
              if (index % 2 === 0) {
                throw new Error(`Handler ${index} error`);
              }
            });
          }
          
          // Emit the event
          eventBus.emit(eventName, {});
          
          // Verify all handlers were invoked in order
          expect(invocationOrder).toEqual(Array.from({ length: handlerCount }, (_, i) => i));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not prevent event propagation when handlers throw', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 9 }), // Index of handler that throws
        (eventName, handlerCount, throwIndex) => {
          fc.pre(throwIndex < handlerCount);
          
          const invoked: boolean[] = new Array(handlerCount).fill(false);
          
          const logger = new ConsoleLogger();
          const eventBus = new EventBus(logger);
          
          // Register handlers
          for (let i = 0; i < handlerCount; i++) {
            const index = i; // Capture the current value of i
            eventBus.on(eventName, () => {
              invoked[index] = true;
              if (index === throwIndex) {
                throw new Error(`Handler ${index} error`);
              }
            });
          }
          
          // Emit the event
          eventBus.emit(eventName, {});
          
          // Verify all handlers were invoked, including those after the throwing one
          expect(invoked.every(v => v)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
