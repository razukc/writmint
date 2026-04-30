import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { PluginDefinition } from '../../src/types.js';

describe('Plugin Discovery Integration', () => {
  let runtime: Runtime;

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdown();
    }
  });

  describe('RuntimeOptions Plugin Discovery', () => {
    it('should accept pluginPaths in RuntimeOptions', () => {
      runtime = new Runtime({
        pluginPaths: ['./plugins', './custom-plugins/my-plugin.js']
      });
      
      expect(runtime).toBeInstanceOf(Runtime);
    });

    it('should accept pluginPackages in RuntimeOptions', () => {
      runtime = new Runtime({
        pluginPackages: ['@my-org/plugin-auth', 'my-custom-plugin']
      });
      
      expect(runtime).toBeInstanceOf(Runtime);
    });

    it('should accept both pluginPaths and pluginPackages', () => {
      runtime = new Runtime({
        pluginPaths: ['./plugins'],
        pluginPackages: ['@my-org/plugin-auth']
      });
      
      expect(runtime).toBeInstanceOf(Runtime);
    });

    it('should work without plugin discovery options', async () => {
      runtime = new Runtime();
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context).toBeDefined();
      expect(context.plugins.getAllPlugins()).toEqual([]);
    });
  });

  describe('Plugin Discovery with Manual Registration', () => {
    it('should load discovered plugins before manual plugins', async () => {
      const manualPlugin: PluginDefinition = {
        name: 'manual-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.actions.registerAction({
            id: 'manual:test',
            handler: async () => 'manual-result'
          });
        }
      };

      runtime = new Runtime({
        pluginPaths: [], // Empty paths for this test
        pluginPackages: [] // Empty packages for this test
      });

      runtime.registerPlugin(manualPlugin);
      await runtime.initialize();

      const context = runtime.getContext();
      const plugins = context.plugins.getAllPlugins();
      
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('manual-plugin');
      
      const result = await context.actions.runAction('manual:test');
      expect(result).toBe('manual-result');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid plugin paths gracefully', async () => {
      runtime = new Runtime({
        pluginPaths: ['/nonexistent/path', './invalid-plugin.js']
      });

      // Should not throw during construction
      expect(runtime).toBeInstanceOf(Runtime);

      // Should not throw during initialization
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.plugins.getAllPlugins()).toEqual([]);
    });

    it('should handle invalid plugin packages gracefully', async () => {
      runtime = new Runtime({
        pluginPackages: ['nonexistent-package-12345', '@invalid/package']
      });

      // Should not throw during construction
      expect(runtime).toBeInstanceOf(Runtime);

      // Should not throw during initialization
      await runtime.initialize();
      
      const context = runtime.getContext();
      expect(context.plugins.getAllPlugins()).toEqual([]);
    });

    it('should continue initialization if plugin discovery fails', async () => {
      const manualPlugin: PluginDefinition = {
        name: 'working-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.actions.registerAction({
            id: 'working:test',
            handler: async () => 'working'
          });
        }
      };

      runtime = new Runtime({
        pluginPaths: ['/invalid/path'],
        pluginPackages: ['invalid-package']
      });

      runtime.registerPlugin(manualPlugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Manual plugin should still work
      const result = await context.actions.runAction('working:test');
      expect(result).toBe('working');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work exactly like v0.2.0 when no discovery options provided', async () => {
      const plugin: PluginDefinition = {
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          ctx.actions.registerAction({
            id: 'test:action',
            handler: async () => 'test-result'
          });
        }
      };

      // This is exactly how v0.2.0 worked
      runtime = new Runtime();
      runtime.registerPlugin(plugin);
      await runtime.initialize();

      const context = runtime.getContext();
      
      // Should work exactly the same
      expect(context.plugins.getAllPlugins()).toHaveLength(1);
      expect(context.screens.getScreen('test-screen')).toBeDefined();
      
      const result = await context.actions.runAction('test:action');
      expect(result).toBe('test-result');
    });
  });
});