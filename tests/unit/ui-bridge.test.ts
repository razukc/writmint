import { describe, it, expect, vi } from 'vitest';
import { UIBridge } from '../../src/ui-bridge.js';
import { ConsoleLogger, ValidationError, DuplicateRegistrationError } from '../../src/types.js';
import type { UIProvider, ScreenDefinition, Logger } from '../../src/types.js';

describe('UIBridge', () => {
  describe('setProvider', () => {
    it('should register a valid UI provider', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      
      expect(() => bridge.setProvider(provider)).not.toThrow();
      expect(bridge.getProvider()).toBe(provider);
    });

    it('should reject duplicate provider registration with DuplicateRegistrationError', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider1: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered1'
      };
      const provider2: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered2'
      };
      
      bridge.setProvider(provider1);
      
      expect(() => bridge.setProvider(provider2)).toThrow(DuplicateRegistrationError);
      expect(() => bridge.setProvider(provider2)).toThrow(
        /\[validation\.duplicate_id\].*UIProvider\[default\]/
      );
    });

    it('should validate provider has mount method with ValidationError', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const invalidProvider = {
        renderScreen: () => 'rendered'
      } as UIProvider;
      
      expect(() => bridge.setProvider(invalidProvider)).toThrow(ValidationError);
      expect(() => bridge.setProvider(invalidProvider)).toThrow(
        /\[validation\.invalid_field\].*UIProvider\.mount/
      );
    });

    it('should validate provider has renderScreen method with ValidationError', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const invalidProvider = {
        mount: () => {}
      } as UIProvider;

      expect(() => bridge.setProvider(invalidProvider)).toThrow(ValidationError);
      expect(() => bridge.setProvider(invalidProvider)).toThrow(
        /\[validation\.invalid_field\].*UIProvider\.renderScreen/
      );
    });

    it('should validate mount is a function', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const invalidProvider = {
        mount: 'not a function',
        renderScreen: () => 'rendered'
      } as unknown as UIProvider;

      expect(() => bridge.setProvider(invalidProvider)).toThrow(ValidationError);
      expect(() => bridge.setProvider(invalidProvider)).toThrow(
        /\[validation\.invalid_field\].*UIProvider\.mount/
      );
    });

    it('should validate renderScreen is a function', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const invalidProvider = {
        mount: () => {},
        renderScreen: 'not a function'
      } as unknown as UIProvider;

      expect(() => bridge.setProvider(invalidProvider)).toThrow(ValidationError);
      expect(() => bridge.setProvider(invalidProvider)).toThrow(
        /\[validation\.invalid_field\].*UIProvider\.renderScreen/
      );
    });
  });

  describe('getProvider', () => {
    it('should return null when no provider is registered', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      
      expect(bridge.getProvider()).toBeNull();
    });

    it('should return the registered provider', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      
      bridge.setProvider(provider);
      
      expect(bridge.getProvider()).toBe(provider);
    });

    it('should return null after clear', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      
      bridge.setProvider(provider);
      bridge.clear();
      
      expect(bridge.getProvider()).toBeNull();
    });
  });

  describe('renderScreen', () => {
    it('should delegate rendering to the provider', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const expectedResult = { rendered: true };
      
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: (s) => {
          expect(s).toBe(screen);
          return expectedResult;
        }
      };
      
      bridge.setProvider(provider);
      const result = bridge.renderScreen(screen);
      
      expect(result).toBe(expectedResult);
    });

    it('should throw error when no provider is registered', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      expect(() => bridge.renderScreen(screen)).toThrow(
        'No UI provider registered'
      );
    });

    it('should pass screen definition to provider renderScreen method', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const screen: ScreenDefinition = {
        id: 'settings',
        title: 'Settings Screen',
        component: 'SettingsComponent'
      };
      
      let receivedScreen: ScreenDefinition | null = null;
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: (s) => {
          receivedScreen = s;
          return 'rendered';
        }
      };
      
      bridge.setProvider(provider);
      bridge.renderScreen(screen);
      
      expect(receivedScreen).toEqual(screen);
    });

    it('should return the result from provider renderScreen method', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const renderResult = { element: 'div', children: [] };
      
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => renderResult
      };
      
      bridge.setProvider(provider);
      const result = bridge.renderScreen(screen);
      
      expect(result).toBe(renderResult);
    });
  });

  describe('shutdown', () => {
    it('should call unmount if provider has unmount method', async () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const unmountSpy = vi.fn();
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered',
        unmount: unmountSpy
      };
      
      bridge.setProvider(provider);
      await bridge.shutdown();
      
      expect(unmountSpy).toHaveBeenCalledOnce();
    });

    it('should not throw if provider does not have unmount method', async () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      
      bridge.setProvider(provider);
      
      await expect(bridge.shutdown()).resolves.not.toThrow();
    });

    it('should handle async unmount', async () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const unmountSpy = vi.fn().mockResolvedValue(undefined);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered',
        unmount: unmountSpy
      };
      
      bridge.setProvider(provider);
      await bridge.shutdown();
      
      expect(unmountSpy).toHaveBeenCalledOnce();
    });

    it('should log unmount errors and continue', async () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };
      const bridge = new UIBridge(logger);
      const unmountError = new Error('Unmount failed');
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered',
        unmount: () => { throw unmountError; }
      };
      
      bridge.setProvider(provider);
      await bridge.shutdown();
      
      expect(logger.error).toHaveBeenCalledWith('UI provider unmount failed', unmountError);
    });

    it('should clear provider after shutdown', async () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered',
        unmount: () => {}
      };
      
      bridge.setProvider(provider);
      await bridge.shutdown();
      
      expect(bridge.getProvider()).toBeNull();
    });

    it('should log debug message on successful unmount', async () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered',
        unmount: () => {}
      };
      
      bridge.setProvider(provider);
      await bridge.shutdown();
      
      expect(logger.debug).toHaveBeenCalledWith('UI provider unmounted');
    });

    it('should not throw if no provider is registered', async () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      
      await expect(bridge.shutdown()).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove the registered provider', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      
      bridge.setProvider(provider);
      bridge.clear();
      
      expect(bridge.getProvider()).toBeNull();
    });

    it('should allow registering a new provider after clear', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider1: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered1'
      };
      const provider2: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered2'
      };
      
      bridge.setProvider(provider1);
      bridge.clear();
      
      // Should not throw since previous provider was cleared
      expect(() => bridge.setProvider(provider2)).not.toThrow();
      expect(bridge.getProvider()).toBe(provider2);
    });

    it('should make renderScreen throw after clear', () => {
      const logger = new ConsoleLogger();
      const bridge = new UIBridge(logger);
      const provider: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered'
      };
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      bridge.setProvider(provider);
      bridge.clear();
      
      expect(() => bridge.renderScreen(screen)).toThrow(
        'No UI provider registered'
      );
    });
  });

  describe('instance isolation', () => {
    it('should maintain separate providers for different UIBridge instances', () => {
      const logger = new ConsoleLogger();
      const bridge1 = new UIBridge(logger);
      const bridge2 = new UIBridge(logger);
      
      const provider1: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered1'
      };
      const provider2: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered2'
      };
      
      bridge1.setProvider(provider1);
      bridge2.setProvider(provider2);
      
      expect(bridge1.getProvider()).toBe(provider1);
      expect(bridge2.getProvider()).toBe(provider2);
    });

    it('should not affect other instances when clearing', () => {
      const logger = new ConsoleLogger();
      const bridge1 = new UIBridge(logger);
      const bridge2 = new UIBridge(logger);
      
      const provider1: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered1'
      };
      const provider2: UIProvider = {
        mount: () => {},
        renderScreen: () => 'rendered2'
      };
      
      bridge1.setProvider(provider1);
      bridge2.setProvider(provider2);
      
      bridge1.clear();
      
      expect(bridge1.getProvider()).toBeNull();
      expect(bridge2.getProvider()).toBe(provider2);
    });
  });
});
