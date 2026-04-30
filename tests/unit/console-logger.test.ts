import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from '../../src/types.js';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new ConsoleLogger();
    
    // Mock console methods
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('debug', () => {
    it('should delegate to console.debug', () => {
      logger.debug('test message');
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy).toHaveBeenCalledWith('test message');
    });

    it('should pass additional arguments to console.debug', () => {
      const obj = { key: 'value' };
      const num = 42;
      
      logger.debug('message with args', obj, num);
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy).toHaveBeenCalledWith('message with args', obj, num);
    });

    it('should not call other console methods', () => {
      logger.debug('test');
      
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should delegate to console.info', () => {
      logger.info('test message');
      
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith('test message');
    });

    it('should pass additional arguments to console.info', () => {
      const obj = { key: 'value' };
      const num = 42;
      
      logger.info('message with args', obj, num);
      
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith('message with args', obj, num);
    });

    it('should not call other console methods', () => {
      logger.info('test');
      
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should delegate to console.warn', () => {
      logger.warn('test message');
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('test message');
    });

    it('should pass additional arguments to console.warn', () => {
      const obj = { key: 'value' };
      const num = 42;
      
      logger.warn('message with args', obj, num);
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('message with args', obj, num);
    });

    it('should not call other console methods', () => {
      logger.warn('test');
      
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should delegate to console.error', () => {
      logger.error('test message');
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('test message');
    });

    it('should pass additional arguments to console.error', () => {
      const obj = { key: 'value' };
      const num = 42;
      
      logger.error('message with args', obj, num);
      
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('message with args', obj, num);
    });

    it('should not call other console methods', () => {
      logger.error('test');
      
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Logger interface compliance', () => {
    it('should implement all Logger interface methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should handle multiple calls to different methods', () => {
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple calls to the same method', () => {
      logger.info('first call');
      logger.info('second call');
      logger.info('third call');
      
      expect(consoleInfoSpy).toHaveBeenCalledTimes(3);
      expect(consoleInfoSpy).toHaveBeenNthCalledWith(1, 'first call');
      expect(consoleInfoSpy).toHaveBeenNthCalledWith(2, 'second call');
      expect(consoleInfoSpy).toHaveBeenNthCalledWith(3, 'third call');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty messages', () => {
      logger.debug('');
      logger.info('');
      logger.warn('');
      logger.error('');
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('');
      expect(consoleInfoSpy).toHaveBeenCalledWith('');
      expect(consoleWarnSpy).toHaveBeenCalledWith('');
      expect(consoleErrorSpy).toHaveBeenCalledWith('');
    });

    it('should handle no additional arguments', () => {
      logger.debug('message');
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('message');
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle many additional arguments', () => {
      logger.info('message', 1, 2, 3, 4, 5);
      
      expect(consoleInfoSpy).toHaveBeenCalledWith('message', 1, 2, 3, 4, 5);
    });

    it('should handle complex objects as arguments', () => {
      const complexObj = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        fn: () => {},
      };
      
      logger.warn('complex', complexObj);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('complex', complexObj);
    });

    it('should handle Error objects as arguments', () => {
      const error = new Error('test error');
      
      logger.error('Error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error occurred', error);
    });
  });
});
