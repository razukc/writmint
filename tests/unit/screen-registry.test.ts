import { describe, it, expect } from 'vitest';
import { ScreenRegistry } from '../../src/screen-registry.js';
import { ConsoleLogger, ValidationError, DuplicateRegistrationError } from '../../src/types.js';
import type { ScreenDefinition } from '../../src/types.js';

describe('ScreenRegistry', () => {
  const logger = new ConsoleLogger();

  describe('registerScreen', () => {
    it('should register a valid screen definition', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      expect(() => registry.registerScreen(screen)).not.toThrow();
      
      const retrieved = registry.getScreen('home');
      expect(retrieved).toEqual(screen);
    });

    it('should reject duplicate screen IDs with DuplicateRegistrationError', () => {
      const registry = new ScreenRegistry(logger);
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const screen2: ScreenDefinition = {
        id: 'home',
        title: 'Different Home',
        component: 'DifferentComponent'
      };
      
      registry.registerScreen(screen1);
      
      expect(() => registry.registerScreen(screen2)).toThrow(DuplicateRegistrationError);
      expect(() => registry.registerScreen(screen2)).toThrow(
        /\[validation\.duplicate_id\].*Screen\[home\]/
      );
    });

    it('should validate required id field with ValidationError', () => {
      const registry = new ScreenRegistry(logger);
      const screenWithoutId = {
        title: 'Home Screen',
        component: 'HomeComponent'
      } as ScreenDefinition;
      
      expect(() => registry.registerScreen(screenWithoutId)).toThrow(ValidationError);
      expect(() => registry.registerScreen(screenWithoutId)).toThrow(
        /\[validation\.invalid_field\].*Screen.*\.id/
      );
    });

    it('should validate required title field with ValidationError', () => {
      const registry = new ScreenRegistry(logger);
      const screenWithoutTitle = {
        id: 'home',
        component: 'HomeComponent'
      } as ScreenDefinition;
      
      expect(() => registry.registerScreen(screenWithoutTitle)).toThrow(ValidationError);
      expect(() => registry.registerScreen(screenWithoutTitle)).toThrow(
        /\[validation\.invalid_field\].*\.title/
      );
    });

    it('should validate required component field with ValidationError', () => {
      const registry = new ScreenRegistry(logger);
      const screenWithoutComponent = {
        id: 'home',
        title: 'Home Screen'
      } as ScreenDefinition;
      
      expect(() => registry.registerScreen(screenWithoutComponent)).toThrow(ValidationError);
      expect(() => registry.registerScreen(screenWithoutComponent)).toThrow(
        /\[validation\.invalid_field\].*\.component/
      );
    });

    it('should reject screen with empty id', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: '',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      expect(() => registry.registerScreen(screen)).toThrow(ValidationError);
      expect(() => registry.registerScreen(screen)).toThrow(
        /\[validation\.invalid_field\].*Screen.*\.id/
      );
    });

    it('should reject screen with non-string id', () => {
      const registry = new ScreenRegistry(logger);
      const screen = {
        id: 123,
        title: 'Home Screen',
        component: 'HomeComponent'
      } as unknown as ScreenDefinition;
      
      expect(() => registry.registerScreen(screen)).toThrow(ValidationError);
      expect(() => registry.registerScreen(screen)).toThrow(
        /\[validation\.invalid_field\].*Screen.*\.id/
      );
    });

    it('should return an unregister function', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      const unregister = registry.registerScreen(screen);
      
      expect(typeof unregister).toBe('function');
      expect(registry.getScreen('home')).toEqual(screen);
      
      unregister();
      
      expect(registry.getScreen('home')).toBeNull();
    });

    it('should make unregister function idempotent', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      const unregister = registry.registerScreen(screen);
      
      // Call unregister multiple times
      unregister();
      expect(() => unregister()).not.toThrow();
      expect(() => unregister()).not.toThrow();
      
      expect(registry.getScreen('home')).toBeNull();
    });
  });

  describe('getScreen', () => {
    it('should return screen definition for existing ID', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'settings',
        title: 'Settings Screen',
        component: 'SettingsComponent'
      };
      
      registry.registerScreen(screen);
      const retrieved = registry.getScreen('settings');
      
      expect(retrieved).toEqual(screen);
    });

    it('should return null for non-existing ID', () => {
      const registry = new ScreenRegistry(logger);
      
      const retrieved = registry.getScreen('non-existent');
      
      expect(retrieved).toBeNull();
    });

    it('should return null after screen is cleared', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      registry.registerScreen(screen);
      registry.clear();
      
      const retrieved = registry.getScreen('home');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllScreens', () => {
    it('should return all registered screens', () => {
      const registry = new ScreenRegistry(logger);
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const screen2: ScreenDefinition = {
        id: 'settings',
        title: 'Settings Screen',
        component: 'SettingsComponent'
      };
      const screen3: ScreenDefinition = {
        id: 'profile',
        title: 'Profile Screen',
        component: 'ProfileComponent'
      };
      
      registry.registerScreen(screen1);
      registry.registerScreen(screen2);
      registry.registerScreen(screen3);
      
      const allScreens = registry.getAllScreens();
      
      expect(allScreens).toHaveLength(3);
      expect(allScreens).toContainEqual(screen1);
      expect(allScreens).toContainEqual(screen2);
      expect(allScreens).toContainEqual(screen3);
    });

    it('should return empty array when no screens are registered', () => {
      const registry = new ScreenRegistry(logger);
      
      const allScreens = registry.getAllScreens();
      
      expect(allScreens).toEqual([]);
    });

    it('should return empty array after clear', () => {
      const registry = new ScreenRegistry(logger);
      const screen: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      
      registry.registerScreen(screen);
      registry.clear();
      
      const allScreens = registry.getAllScreens();
      expect(allScreens).toEqual([]);
    });

    it('should return a copy that does not affect internal state when modified', () => {
      const registry = new ScreenRegistry(logger);
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const screen2: ScreenDefinition = {
        id: 'settings',
        title: 'Settings Screen',
        component: 'SettingsComponent'
      };
      
      registry.registerScreen(screen1);
      registry.registerScreen(screen2);
      
      const allScreens = registry.getAllScreens();
      
      // Modify the returned array
      allScreens.pop();
      allScreens.push({
        id: 'malicious',
        title: 'Malicious Screen',
        component: 'MaliciousComponent'
      });
      
      // Internal state should be unchanged
      const allScreensAgain = registry.getAllScreens();
      expect(allScreensAgain).toHaveLength(2);
      expect(allScreensAgain).toContainEqual(screen1);
      expect(allScreensAgain).toContainEqual(screen2);
      expect(registry.getScreen('malicious')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all registered screens', () => {
      const registry = new ScreenRegistry(logger);
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const screen2: ScreenDefinition = {
        id: 'settings',
        title: 'Settings Screen',
        component: 'SettingsComponent'
      };
      
      registry.registerScreen(screen1);
      registry.registerScreen(screen2);
      
      registry.clear();
      
      expect(registry.getScreen('home')).toBeNull();
      expect(registry.getScreen('settings')).toBeNull();
      expect(registry.getAllScreens()).toEqual([]);
    });

    it('should allow registering screens after clear', () => {
      const registry = new ScreenRegistry(logger);
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen',
        component: 'HomeComponent'
      };
      const screen2: ScreenDefinition = {
        id: 'home',
        title: 'New Home Screen',
        component: 'NewHomeComponent'
      };
      
      registry.registerScreen(screen1);
      registry.clear();
      
      // Should not throw since previous screen was cleared
      expect(() => registry.registerScreen(screen2)).not.toThrow();
      expect(registry.getScreen('home')).toEqual(screen2);
    });
  });

  describe('instance isolation', () => {
    it('should maintain separate registries for different ScreenRegistry instances', () => {
      const registry1 = new ScreenRegistry(logger);
      const registry2 = new ScreenRegistry(logger);
      
      const screen1: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen 1',
        component: 'HomeComponent1'
      };
      const screen2: ScreenDefinition = {
        id: 'home',
        title: 'Home Screen 2',
        component: 'HomeComponent2'
      };
      
      registry1.registerScreen(screen1);
      registry2.registerScreen(screen2);
      
      expect(registry1.getScreen('home')).toEqual(screen1);
      expect(registry2.getScreen('home')).toEqual(screen2);
      expect(registry1.getAllScreens()).toHaveLength(1);
      expect(registry2.getAllScreens()).toHaveLength(1);
    });
  });
});
