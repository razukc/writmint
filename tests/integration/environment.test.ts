import { describe, it, expect } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.join(path.dirname(__filename), '..', 'src');

describe('Environment tests', () => {
  describe('Node.js environment execution', () => {
    it('should execute successfully in Node.js environment', async () => {
      // Requirements: 11.3
      // Verify runtime can be instantiated and initialized in Node.js
      const runtime = new Runtime();
      
      await expect(runtime.initialize()).resolves.not.toThrow();
      
      // Verify we can access the context
      const context = runtime.getContext();
      expect(context).toBeDefined();
      expect(context.screens).toBeDefined();
      expect(context.actions).toBeDefined();
      expect(context.plugins).toBeDefined();
      expect(context.events).toBeDefined();
      
      await runtime.shutdown();
    });

    it('should support Node.js APIs without browser dependencies', async () => {
      // Requirements: 11.2, 11.3
      // Verify runtime works with Node.js specific features
      const runtime = new Runtime();
      
      runtime.registerPlugin({
        name: 'node-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          // Register an action that uses Node.js APIs
          ctx.actions.registerAction({
            id: 'node-action',
            handler: async () => {
              // Use Node.js process API (not available in browsers)
              return process.version;
            }
          });
        }
      });
      
      await runtime.initialize();
      const context = runtime.getContext();
      
      // Execute action that uses Node.js APIs
      const result = await context.actions.runAction('node-action');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^v\d+\.\d+\.\d+/);
      
      await runtime.shutdown();
    });
  });

  describe('No DOM or browser API dependencies', () => {
    it('should not reference window object in source code', () => {
      // Requirements: 11.2
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for window references
          expect(content).not.toMatch(/\bwindow\b/);
          expect(content).not.toMatch(/\bWindow\b/);
        }
      }
    });

    it('should not reference document object in source code', () => {
      // Requirements: 11.2
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for document references
          expect(content).not.toMatch(/\bdocument\b/);
          expect(content).not.toMatch(/\bDocument\b/);
        }
      }
    });

    it('should not reference DOM APIs in source code', () => {
      // Requirements: 11.2
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      const domAPIs = [
        'HTMLElement',
        'Element',
        'Node',
        'addEventListener',
        'querySelector',
        'getElementById',
        'createElement',
        'appendChild',
        'removeChild',
        'innerHTML',
        'outerHTML'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          for (const api of domAPIs) {
            // Allow HTMLElement in type definitions (UIProvider.mount parameter)
            // but not in implementation code
            if (api === 'HTMLElement' && file === 'types.ts') {
              continue;
            }
            
            const regex = new RegExp(`\\b${api}\\b`);
            expect(content).not.toMatch(regex);
          }
        }
      }
    });

    it('should work without browser globals', async () => {
      // Requirements: 11.2, 11.3
      // Verify runtime doesn't depend on browser globals
      const runtime = new Runtime();
      
      runtime.registerPlugin({
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
          
          ctx.actions.registerAction({
            id: 'test-action',
            handler: async () => 'success'
          });
        }
      });
      
      await runtime.initialize();
      const context = runtime.getContext();
      
      // Verify all operations work without browser APIs
      expect(context.screens.getScreen('test-screen')).not.toBeNull();
      expect(await context.actions.runAction('test-action')).toBe('success');
      
      let eventFired = false;
      context.events.on('test-event', () => { eventFired = true; });
      context.events.emit('test-event');
      expect(eventFired).toBe(true);
      
      await runtime.shutdown();
    });
  });

  describe('No UI framework dependencies', () => {
    it('should not import React in source code', () => {
      // Requirements: 11.1
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for React imports
          expect(content).not.toMatch(/from\s+['"]react['"]/);
          expect(content).not.toMatch(/require\s*\(\s*['"]react['"]\s*\)/);
        }
      }
    });

    it('should not import Vue in source code', () => {
      // Requirements: 11.1
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for Vue imports
          expect(content).not.toMatch(/from\s+['"]vue['"]/);
          expect(content).not.toMatch(/require\s*\(\s*['"]vue['"]\s*\)/);
        }
      }
    });

    it('should not import Angular in source code', () => {
      // Requirements: 11.1
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for Angular imports
          expect(content).not.toMatch(/from\s+['"]@angular\//);
          expect(content).not.toMatch(/require\s*\(\s*['"]@angular\//);
        }
      }
    });

    it('should not import Svelte in source code', () => {
      // Requirements: 11.1
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'types.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for Svelte imports
          expect(content).not.toMatch(/from\s+['"]svelte['"]/);
          expect(content).not.toMatch(/require\s*\(\s*['"]svelte['"]\s*\)/);
        }
      }
    });

    it('should operate without UI framework dependencies', async () => {
      // Requirements: 11.1, 11.4
      // Verify runtime works completely without any UI framework
      const runtime = new Runtime();
      
      runtime.registerPlugin({
        name: 'framework-free-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          // Register screens without any UI framework
          ctx.screens.registerScreen({
            id: 'screen1',
            title: 'Screen 1',
            component: 'Component1'
          });
          
          // Register actions without any UI framework
          ctx.actions.registerAction({
            id: 'action1',
            handler: async (params) => {
              return { result: 'success', params };
            }
          });
          
          // Use events without any UI framework
          ctx.events.on('custom-event', (data) => {
            // Event handling without UI framework
          });
        }
      });
      
      await runtime.initialize();
      const context = runtime.getContext();
      
      // Verify all functionality works
      expect(context.screens.getAllScreens()).toHaveLength(1);
      const result = await context.actions.runAction('action1', { test: 'data' });
      expect(result).toEqual({ result: 'success', params: { test: 'data' } });
      
      await runtime.shutdown();
    });
  });

  describe('No global state', () => {
    it('should not use global variables for business logic', async () => {
      // Requirements: 1.3
      // Create two separate runtime instances
      const runtime1 = new Runtime();
      const runtime2 = new Runtime();
      
      // Register different plugins in each
      runtime1.registerPlugin({
        name: 'plugin1',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'screen1',
            title: 'Screen 1',
            component: 'Component1'
          });
        }
      });
      
      runtime2.registerPlugin({
        name: 'plugin2',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'screen2',
            title: 'Screen 2',
            component: 'Component2'
          });
        }
      });
      
      await runtime1.initialize();
      await runtime2.initialize();
      
      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();
      
      // Verify each runtime has only its own screens
      expect(context1.screens.getAllScreens()).toHaveLength(1);
      expect(context1.screens.getScreen('screen1')).not.toBeNull();
      expect(context1.screens.getScreen('screen2')).toBeNull();
      
      expect(context2.screens.getAllScreens()).toHaveLength(1);
      expect(context2.screens.getScreen('screen2')).not.toBeNull();
      expect(context2.screens.getScreen('screen1')).toBeNull();
      
      await runtime1.shutdown();
      await runtime2.shutdown();
    });

    it('should maintain separate state across multiple runtime instances', async () => {
      // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
      const runtime1 = new Runtime();
      const runtime2 = new Runtime();
      const runtime3 = new Runtime();
      
      // Initialize all runtimes
      await runtime1.initialize();
      await runtime2.initialize();
      await runtime3.initialize();
      
      const context1 = runtime1.getContext();
      const context2 = runtime2.getContext();
      const context3 = runtime3.getContext();
      
      // Register different items in each runtime
      context1.screens.registerScreen({
        id: 'screen-r1',
        title: 'Runtime 1 Screen',
        component: 'Component1'
      });
      
      context2.actions.registerAction({
        id: 'action-r2',
        handler: async () => 'runtime2'
      });
      
      let r3EventFired = false;
      context3.events.on('event-r3', () => { r3EventFired = true; });
      
      // Verify isolation
      expect(context1.screens.getScreen('screen-r1')).not.toBeNull();
      expect(context2.screens.getScreen('screen-r1')).toBeNull();
      expect(context3.screens.getScreen('screen-r1')).toBeNull();
      
      await expect(context1.actions.runAction('action-r2')).rejects.toThrow();
      expect(await context2.actions.runAction('action-r2')).toBe('runtime2');
      await expect(context3.actions.runAction('action-r2')).rejects.toThrow();
      
      context1.events.emit('event-r3');
      context2.events.emit('event-r3');
      expect(r3EventFired).toBe(false);
      context3.events.emit('event-r3');
      expect(r3EventFired).toBe(true);
      
      await runtime1.shutdown();
      await runtime2.shutdown();
      await runtime3.shutdown();
    });

    it('should not leak state between runtime instances after shutdown', async () => {
      // Requirements: 1.3, 4.5
      const runtime1 = new Runtime();
      
      runtime1.registerPlugin({
        name: 'test-plugin',
        version: '1.0.0',
        setup: (ctx) => {
          ctx.screens.registerScreen({
            id: 'test-screen',
            title: 'Test Screen',
            component: 'TestComponent'
          });
        }
      });
      
      await runtime1.initialize();
      const context1 = runtime1.getContext();
      expect(context1.screens.getScreen('test-screen')).not.toBeNull();
      
      await runtime1.shutdown();
      
      // Create a new runtime instance
      const runtime2 = new Runtime();
      await runtime2.initialize();
      const context2 = runtime2.getContext();
      
      // New runtime should not have the screen from the previous runtime
      expect(context2.screens.getScreen('test-screen')).toBeNull();
      expect(context2.screens.getAllScreens()).toHaveLength(0);
      
      await runtime2.shutdown();
    });

    it('should not share plugin state between instances', async () => {
      // Requirements: 1.5
      let plugin1SetupCount = 0;
      let plugin2SetupCount = 0;
      
      const plugin1 = {
        name: 'shared-plugin',
        version: '1.0.0',
        setup: () => {
          plugin1SetupCount++;
        }
      };
      
      const plugin2 = {
        name: 'shared-plugin',
        version: '1.0.0',
        setup: () => {
          plugin2SetupCount++;
        }
      };
      
      const runtime1 = new Runtime();
      const runtime2 = new Runtime();
      
      runtime1.registerPlugin(plugin1);
      runtime2.registerPlugin(plugin2);
      
      await runtime1.initialize();
      expect(plugin1SetupCount).toBe(1);
      expect(plugin2SetupCount).toBe(0);
      
      await runtime2.initialize();
      expect(plugin1SetupCount).toBe(1);
      expect(plugin2SetupCount).toBe(1);
      
      await runtime1.shutdown();
      await runtime2.shutdown();
    });
  });

  describe('No bundler requirement', () => {
    it('should use ES module imports compatible with Node.js', () => {
      // Requirements: 11.5
      const srcDir = path.join(__dirname);
      const sourceFiles = [
        'runtime.ts',
        'plugin-registry.ts',
        'screen-registry.ts',
        'action-engine.ts',
        'event-bus.ts',
        'ui-bridge.ts',
        'runtime-context.ts',
        'index.ts'
      ];
      
      for (const file of sourceFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check that imports use .js extension (required for Node.js ES modules)
          const importMatches = content.match(/from\s+['"]\.\/[^'"]+['"]/g);
          if (importMatches) {
            for (const importStatement of importMatches) {
              // All relative imports should end with .js
              expect(importStatement).toMatch(/\.js['"]/);
            }
          }
        }
      }
    });

    it('should work with native Node.js ES module support', async () => {
      // Requirements: 11.5
      // This test itself proves the runtime works without bundlers
      // since vitest runs the code directly
      const runtime = new Runtime();
      
      await runtime.initialize();
      const context = runtime.getContext();
      
      // Verify all subsystems are accessible
      expect(context.screens).toBeDefined();
      expect(context.actions).toBeDefined();
      expect(context.plugins).toBeDefined();
      expect(context.events).toBeDefined();
      
      await runtime.shutdown();
    });
  });
});
