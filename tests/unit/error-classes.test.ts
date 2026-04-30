import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  DuplicateRegistrationError,
  ActionTimeoutError,
  ActionExecutionError,
} from '../../src/types.js';
import { ErrorCodes, isStructuredError } from '../../src/errors.js';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('constructs with resourceType and field, exposes structured payload', () => {
      const error = new ValidationError('Plugin', 'name');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.resourceType).toBe('Plugin');
      expect(error.field).toBe('name');
      expect(error.resourceId).toBeUndefined();

      expect(isStructuredError(error)).toBe(true);
      expect(error.structured.code).toBe(ErrorCodes.validation.invalidField);
      expect(error.structured.where).toBe('Plugin.name');
    });

    it('includes resourceId in the structured location when present', () => {
      const error = new ValidationError('Action', 'handler', 'my-action');
      expect(error.structured.where).toBe('Action[my-action].handler');
      expect(error.resourceId).toBe('my-action');
    });

    it('is throwable and catchable, message embeds the structured code', () => {
      expect(() => {
        throw new ValidationError('Plugin', 'version');
      }).toThrow(ValidationError);

      expect(() => {
        throw new ValidationError('Plugin', 'version');
      }).toThrow(/\[validation\.invalid_field\]/);
    });
  });

  describe('DuplicateRegistrationError', () => {
    it('exposes a structured duplicate-id code', () => {
      const error = new DuplicateRegistrationError('Action', 'duplicate-action');
      expect(error.structured.code).toBe(ErrorCodes.validation.duplicateId);
      expect(error.structured.where).toBe('Action[duplicate-action]');
      expect(error.identifier).toBe('duplicate-action');
    });

    it('is throwable and catchable', () => {
      expect(() => {
        throw new DuplicateRegistrationError('Screen', 'home');
      }).toThrow(DuplicateRegistrationError);
      expect(() => {
        throw new DuplicateRegistrationError('Screen', 'home');
      }).toThrow(/\[validation\.duplicate_id\]/);
    });
  });

  describe('ActionTimeoutError', () => {
    it('exposes a structured timeout code with the deadline in expected', () => {
      const error = new ActionTimeoutError('my-action', 3000);
      expect(error.structured.code).toBe(ErrorCodes.action.timeout);
      expect(error.structured.where).toBe('action[my-action]');
      expect(error.structured.expected).toContain('3000ms');
      expect(error.timeoutMs).toBe(3000);
    });

    it('is throwable and catchable', () => {
      expect(() => {
        throw new ActionTimeoutError('timeout-action', 2000);
      }).toThrow(ActionTimeoutError);
      expect(() => {
        throw new ActionTimeoutError('timeout-action', 2000);
      }).toThrow(/\[action\.timeout\]/);
    });
  });

  describe('ActionExecutionError', () => {
    it('exposes handler_threw with the cause message in actual', () => {
      const cause = new Error('Database connection failed');
      const error = new ActionExecutionError('fetch-data', cause);
      expect(error.structured.code).toBe(ErrorCodes.action.handlerThrew);
      expect(error.structured.where).toBe('action[fetch-data].handler');
      expect(error.structured.actual).toBe('Database connection failed');
      expect(error.cause).toBe(cause);
    });

    it('preserves the cause chain', () => {
      const root = new Error('Root cause');
      const wrapped = new ActionExecutionError('inner', root);
      const outer = new ActionExecutionError('outer', wrapped);
      expect(outer.cause).toBe(wrapped);
      if (outer.cause instanceof ActionExecutionError) {
        expect(outer.cause.cause).toBe(root);
      }
    });
  });

  describe('Error class relationships', () => {
    it('all extend Error and carry structured payloads', () => {
      const errors = [
        new ValidationError('Test', 'field'),
        new DuplicateRegistrationError('Test', 'id'),
        new ActionTimeoutError('action', 1000),
        new ActionExecutionError('action', new Error('cause')),
      ];
      for (const e of errors) {
        expect(e).toBeInstanceOf(Error);
        expect(isStructuredError(e)).toBe(true);
      }
      const codes = errors.map((e) => (e as { structured: { code: string } }).structured.code);
      expect(new Set(codes).size).toBe(4);
    });
  });
});
