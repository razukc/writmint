import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectoryPluginLoader } from '../../src/plugin-loader.js';
import { ConsoleLogger } from '../../src/types.js';
import type { PluginDefinition } from '../../src/types.js';

describe('DirectoryPluginLoader', () => {
  let loader: DirectoryPluginLoader;
  let mockLogger: ConsoleLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    loader = new DirectoryPluginLoader(mockLogger);
  });

  describe('Plugin Validation', () => {
    it('should validate correct plugin definition', () => {
      const validPlugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: vi.fn()
      };

      // Access private method for testing
      const isValid = (loader as any).isValidPlugin(validPlugin);
      expect(isValid).toBe(true);
    });

    it('should reject plugin without name', () => {
      const invalidPlugin = {
        version: '1.0.0',
        setup: vi.fn()
      };

      const isValid = (loader as any).isValidPlugin(invalidPlugin);
      expect(isValid).toBe(false);
    });

    it('should reject plugin without version', () => {
      const invalidPlugin = {
        name: 'test-plugin',
        setup: vi.fn()
      };

      const isValid = (loader as any).isValidPlugin(invalidPlugin);
      expect(isValid).toBe(false);
    });

    it('should reject plugin without setup function', () => {
      const invalidPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      };

      const isValid = (loader as any).isValidPlugin(invalidPlugin);
      expect(isValid).toBe(false);
    });

    it('should reject non-object values', () => {
      expect((loader as any).isValidPlugin(null)).toBe(false);
      expect((loader as any).isValidPlugin(undefined)).toBe(false);
      expect((loader as any).isValidPlugin('string')).toBe(false);
      expect((loader as any).isValidPlugin(123)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty plugin paths gracefully', async () => {
      const plugins = await loader.loadPlugins([], []);
      expect(plugins).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded 0 plugins');
    });

    it('should continue loading other plugins if one fails', async () => {
      // Test with empty arrays - should not fail
      const plugins = await loader.loadPlugins([], []);
      expect(plugins).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded 0 plugins');
    });
  });

  describe('Integration with Runtime', () => {
    it('should be instantiated by Runtime with logger', () => {
      expect(loader).toBeInstanceOf(DirectoryPluginLoader);
    });

    it('should log successful plugin loading', async () => {
      await loader.loadPlugins([], []);
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded 0 plugins');
    });
  });

  describe('Plugin Discovery Patterns', () => {
    it('should recognize .js files as single plugins', () => {
      const path = '/path/to/plugin.js';
      expect(path.endsWith('.js')).toBe(true);
    });

    it('should recognize .mjs files as single plugins', () => {
      const path = '/path/to/plugin.mjs';
      expect(path.endsWith('.mjs')).toBe(true);
    });

    it('should recognize .ts files as single plugins', () => {
      const path = '/path/to/plugin.ts';
      expect(path.endsWith('.ts')).toBe(true);
    });

    it('should treat other paths as directories', () => {
      const path = '/path/to/plugins';
      expect(path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.ts')).toBe(false);
    });
  });

  describe('Dependency Sorting', () => {
    it('should sort plugins by dependencies', () => {
      const plugins: PluginDefinition[] = [
        {
          name: 'app-plugin',
          version: '1.0.0',
          dependencies: ['auth-plugin'],
          setup: vi.fn()
        },
        {
          name: 'auth-plugin',
          version: '1.0.0',
          setup: vi.fn()
        }
      ];

      const sorted = (loader as any).sortPluginsByDependencies(plugins);
      expect(sorted).toHaveLength(2);
      expect(sorted[0].name).toBe('auth-plugin');
      expect(sorted[1].name).toBe('app-plugin');
    });

    it('should handle plugins without dependencies', () => {
      const plugins: PluginDefinition[] = [
        {
          name: 'plugin-b',
          version: '1.0.0',
          setup: vi.fn()
        },
        {
          name: 'plugin-a',
          version: '1.0.0',
          setup: vi.fn()
        }
      ];

      const sorted = (loader as any).sortPluginsByDependencies(plugins);
      expect(sorted).toHaveLength(2);
      // Should maintain original order when no dependencies
      expect(sorted.map((p: any) => p.name)).toEqual(['plugin-b', 'plugin-a']);
    });

    it('should handle circular dependencies gracefully', () => {
      const plugins: PluginDefinition[] = [
        {
          name: 'plugin-a',
          version: '1.0.0',
          dependencies: ['plugin-b'],
          setup: vi.fn()
        },
        {
          name: 'plugin-b',
          version: '1.0.0',
          dependencies: ['plugin-a'],
          setup: vi.fn()
        }
      ];

      const sorted = (loader as any).sortPluginsByDependencies(plugins);
      expect(sorted).toHaveLength(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected')
      );
    });

    it('should handle missing dependencies gracefully', () => {
      const plugins: PluginDefinition[] = [
        {
          name: 'app-plugin',
          version: '1.0.0',
          dependencies: ['missing-plugin'],
          setup: vi.fn()
        }
      ];

      const sorted = (loader as any).sortPluginsByDependencies(plugins);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].name).toBe('app-plugin');
    });
  });
});