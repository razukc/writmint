import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import type { RuntimeContext } from '../../src/types.js';

describe('Introspection API', () => {
  let runtime: Runtime;
  let context: RuntimeContext;

  beforeEach(async () => {
    runtime = new Runtime();
    await runtime.initialize();
    context = runtime.getContext();
  });

  afterEach(async () => {
    await runtime.shutdown();
  });

  describe('Action Introspection', () => {
    it('should list all registered actions', () => {
      // Register multiple actions
      context.actions.registerAction({ id: 'action1', handler: () => 'result1' });
      context.actions.registerAction({ id: 'action2', handler: () => 'result2' });
      context.actions.registerAction({ id: 'action3', handler: () => 'result3' });

      const actions = context.introspect.listActions();

      expect(actions).toHaveLength(3);
      expect(actions).toContain('action1');
      expect(actions).toContain('action2');
      expect(actions).toContain('action3');
    });

    it('should get action definition with valid ID', () => {
      context.actions.registerAction({
        id: 'test:action',
        handler: () => 'result',
        timeout: 5000
      });

      const metadata = context.introspect.getActionDefinition('test:action');

      expect(metadata).not.toBeNull();
      expect(metadata?.id).toBe('test:action');
      expect(metadata?.timeout).toBe(5000);
    });

    it('should return null for invalid action ID', () => {
      const metadata = context.introspect.getActionDefinition('nonexistent');
      expect(metadata).toBeNull();
    });

    it('should not include handler function in metadata', () => {
      context.actions.registerAction({
        id: 'test:action',
        handler: () => 'result'
      });

      const metadata = context.introspect.getActionDefinition('test:action');

      expect(metadata).not.toBeNull();
      // Check that no property is a function
      if (metadata) {
        Object.values(metadata).forEach(value => {
          expect(typeof value).not.toBe('function');
        });
      }
    });

    it('should return deeply frozen action metadata', () => {
      context.actions.registerAction({
        id: 'test:action',
        handler: () => 'result',
        timeout: 5000
      });

      const metadata = context.introspect.getActionDefinition('test:action');

      expect(metadata).not.toBeNull();
      expect(Object.isFrozen(metadata)).toBe(true);
    });
  });

  describe('Plugin Introspection', () => {
    it('should list all registered plugins', () => {
      context.plugins.registerPlugin({
        name: 'plugin1',
        version: '1.0.0',
        setup: () => {}
      });
      context.plugins.registerPlugin({
        name: 'plugin2',
        version: '2.0.0',
        setup: () => {}
      });
      context.plugins.registerPlugin({
        name: 'plugin3',
        version: '3.0.0',
        setup: () => {}
      });

      const plugins = context.introspect.listPlugins();

      expect(plugins).toHaveLength(3);
      expect(plugins).toContain('plugin1');
      expect(plugins).toContain('plugin2');
      expect(plugins).toContain('plugin3');
    });

    it('should get plugin definition with valid name', () => {
      context.plugins.registerPlugin({
        name: 'test-plugin',
        version: '1.2.3',
        setup: () => {}
      });

      const metadata = context.introspect.getPluginDefinition('test-plugin');

      expect(metadata).not.toBeNull();
      expect(metadata?.name).toBe('test-plugin');
      expect(metadata?.version).toBe('1.2.3');
    });

    it('should return null for invalid plugin name', () => {
      const metadata = context.introspect.getPluginDefinition('nonexistent');
      expect(metadata).toBeNull();
    });

    it('should not include setup/dispose functions in metadata', () => {
      context.plugins.registerPlugin({
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {},
        dispose: () => {}
      });

      const metadata = context.introspect.getPluginDefinition('test-plugin');

      expect(metadata).not.toBeNull();
      // Check that no property is a function
      if (metadata) {
        Object.values(metadata).forEach(value => {
          expect(typeof value).not.toBe('function');
        });
      }
    });

    it('should return deeply frozen plugin metadata', () => {
      context.plugins.registerPlugin({
        name: 'test-plugin',
        version: '1.0.0',
        setup: () => {}
      });

      const metadata = context.introspect.getPluginDefinition('test-plugin');

      expect(metadata).not.toBeNull();
      expect(Object.isFrozen(metadata)).toBe(true);
    });
  });

  describe('Screen Introspection', () => {
    it('should list all registered screens', () => {
      context.screens.registerScreen({ id: 'screen1', title: 'Screen 1', component: 'Component1' });
      context.screens.registerScreen({ id: 'screen2', title: 'Screen 2', component: 'Component2' });
      context.screens.registerScreen({ id: 'screen3', title: 'Screen 3', component: 'Component3' });

      const screens = context.introspect.listScreens();

      expect(screens).toHaveLength(3);
      expect(screens).toContain('screen1');
      expect(screens).toContain('screen2');
      expect(screens).toContain('screen3');
    });

    it('should get screen definition with valid ID', () => {
      context.screens.registerScreen({
        id: 'test:screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });

      const metadata = context.introspect.getScreenDefinition('test:screen');

      expect(metadata).not.toBeNull();
      expect(metadata?.id).toBe('test:screen');
      expect(metadata?.title).toBe('Test Screen');
      expect(metadata?.component).toBe('TestComponent');
    });

    it('should return null for invalid screen ID', () => {
      const metadata = context.introspect.getScreenDefinition('nonexistent');
      expect(metadata).toBeNull();
    });

    it('should include all screen properties', () => {
      context.screens.registerScreen({
        id: 'test:screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });

      const metadata = context.introspect.getScreenDefinition('test:screen');

      expect(metadata).not.toBeNull();
      expect(metadata).toHaveProperty('id');
      expect(metadata).toHaveProperty('title');
      expect(metadata).toHaveProperty('component');
    });

    it('should return deeply frozen screen metadata', () => {
      context.screens.registerScreen({
        id: 'test:screen',
        title: 'Test Screen',
        component: 'TestComponent'
      });

      const metadata = context.introspect.getScreenDefinition('test:screen');

      expect(metadata).not.toBeNull();
      expect(Object.isFrozen(metadata)).toBe(true);
    });
  });

  describe('Runtime Metadata', () => {
    it('should return all runtime statistics', () => {
      const metadata = context.introspect.getMetadata();

      expect(metadata).toHaveProperty('runtimeVersion');
      expect(metadata).toHaveProperty('totalActions');
      expect(metadata).toHaveProperty('totalPlugins');
      expect(metadata).toHaveProperty('totalScreens');
    });

    it('should have accurate counts', () => {
      // Register known number of resources
      context.actions.registerAction({ id: 'action1', handler: () => {} });
      context.actions.registerAction({ id: 'action2', handler: () => {} });
      context.plugins.registerPlugin({ name: 'plugin1', version: '1.0.0', setup: () => {} });
      context.screens.registerScreen({ id: 'screen1', title: 'Screen 1', component: 'Component1' });

      const metadata = context.introspect.getMetadata();

      expect(metadata.totalActions).toBe(2);
      expect(metadata.totalPlugins).toBe(1);
      expect(metadata.totalScreens).toBe(1);
    });

    it('should include runtime version', () => {
      const metadata = context.introspect.getMetadata();

      expect(metadata.runtimeVersion).toBe('0.1.0');
    });

    it('should return deeply frozen metadata', () => {
      const metadata = context.introspect.getMetadata();

      expect(Object.isFrozen(metadata)).toBe(true);
    });
  });
});
