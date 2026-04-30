import { describe, it, expect } from 'vitest';

/**
 * Deep freeze utility - recursively freezes an object and all nested objects.
 * This is a copy of the internal deepFreeze function from runtime-context.ts
 * for testing purposes.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  // Freeze the object itself (Requirement 7.1)
  Object.freeze(obj);

  // Iterate over all properties (Requirement 7.2)
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop];

    // Skip functions (Requirement 7.4)
    if (typeof value === 'function') {
      return;
    }

    // Skip already frozen objects (Requirement 7.5)
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      // Recursively freeze nested objects and arrays (Requirements 7.2, 7.3)
      deepFreeze(value);
    }
  });

  return obj as Readonly<T>;
}

describe('Deep Freeze Utility', () => {
  describe('Freezing simple objects', () => {
    it('should freeze a simple object', () => {
      // Requirement 7.1: Freeze object itself
      const obj = { name: 'test', value: 42 };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('should prevent adding new properties to frozen object', () => {
      const obj = { name: 'test' };
      const frozen = deepFreeze(obj);

      expect(() => {
        (frozen as any).newProp = 'value';
      }).toThrow();
    });

    it('should prevent modifying existing properties', () => {
      const obj = { name: 'test', value: 42 };
      const frozen = deepFreeze(obj);

      expect(() => {
        (frozen as any).name = 'changed';
      }).toThrow();
    });

    it('should prevent deleting properties', () => {
      const obj = { name: 'test', value: 42 };
      const frozen = deepFreeze(obj);

      expect(() => {
        delete (frozen as any).name;
      }).toThrow();
    });
  });

  describe('Recursive freezing of nested objects', () => {
    it('should recursively freeze nested objects', () => {
      // Requirement 7.2: Recursively freeze nested objects
      const obj = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.level1)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2.level3)).toBe(true);
    });

    it('should prevent mutation of nested objects', () => {
      const obj = {
        outer: {
          inner: {
            value: 'test'
          }
        }
      };
      const frozen = deepFreeze(obj);

      expect(() => {
        (frozen.outer.inner as any).value = 'changed';
      }).toThrow();
    });

    it('should freeze objects with mixed types', () => {
      const obj = {
        string: 'text',
        number: 42,
        boolean: true,
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        }
      };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.nested)).toBe(true);
      expect(Object.isFrozen(frozen.nested.array)).toBe(true);
      expect(Object.isFrozen(frozen.nested.object)).toBe(true);
    });
  });

  describe('Freezing arrays', () => {
    it('should freeze arrays', () => {
      // Requirement 7.3: Freeze arrays
      const arr = [1, 2, 3, 4, 5];
      const frozen = deepFreeze(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('should prevent modifying array elements', () => {
      const arr = [1, 2, 3];
      const frozen = deepFreeze(arr);

      expect(() => {
        (frozen as any)[0] = 999;
      }).toThrow();
    });

    it('should prevent adding elements to array', () => {
      const arr = [1, 2, 3];
      const frozen = deepFreeze(arr);

      expect(() => {
        (frozen as any).push(4);
      }).toThrow();
    });

    it('should freeze nested arrays', () => {
      const arr = [[1, 2], [3, 4], [5, 6]];
      const frozen = deepFreeze(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen[0])).toBe(true);
      expect(Object.isFrozen(frozen[1])).toBe(true);
      expect(Object.isFrozen(frozen[2])).toBe(true);
    });

    it('should freeze arrays containing objects', () => {
      const arr = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' }
      ];
      const frozen = deepFreeze(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen[0])).toBe(true);
      expect(Object.isFrozen(frozen[1])).toBe(true);
    });
  });

  describe('Skipping functions', () => {
    it('should skip freezing functions', () => {
      // Requirement 7.4: Skip functions
      const fn = () => 'test';
      const obj = {
        method: fn,
        value: 42
      };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.method)).toBe(false);
      expect(typeof frozen.method).toBe('function');
      expect(frozen.method()).toBe('test');
    });

    it('should allow functions to remain callable', () => {
      const obj = {
        handler: (x: number) => x * 2,
        data: { value: 10 }
      };
      const frozen = deepFreeze(obj);

      expect(frozen.handler(5)).toBe(10);
      expect(Object.isFrozen(frozen.data)).toBe(true);
    });

    it('should handle objects with multiple functions', () => {
      const obj = {
        add: (a: number, b: number) => a + b,
        subtract: (a: number, b: number) => a - b,
        config: { timeout: 5000 }
      };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.add)).toBe(false);
      expect(Object.isFrozen(frozen.subtract)).toBe(false);
      expect(Object.isFrozen(frozen.config)).toBe(true);
      expect(frozen.add(2, 3)).toBe(5);
      expect(frozen.subtract(5, 3)).toBe(2);
    });
  });

  describe('Skipping already frozen objects', () => {
    it('should skip already frozen objects', () => {
      // Requirement 7.5: Skip already frozen objects
      const inner = Object.freeze({ value: 'frozen' });
      const obj = {
        alreadyFrozen: inner,
        notFrozen: { value: 'not frozen' }
      };

      expect(Object.isFrozen(obj.alreadyFrozen)).toBe(true);
      expect(Object.isFrozen(obj.notFrozen)).toBe(false);

      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.alreadyFrozen)).toBe(true);
      expect(Object.isFrozen(frozen.notFrozen)).toBe(true);
    });

    it('should not cause errors when encountering frozen objects', () => {
      const frozenInner = Object.freeze({ id: 1 });
      const obj = {
        frozen1: frozenInner,
        frozen2: Object.freeze({ id: 2 }),
        normal: { id: 3 }
      };

      expect(() => {
        deepFreeze(obj);
      }).not.toThrow();

      expect(Object.isFrozen(obj)).toBe(true);
      expect(Object.isFrozen(obj.frozen1)).toBe(true);
      expect(Object.isFrozen(obj.frozen2)).toBe(true);
      expect(Object.isFrozen(obj.normal)).toBe(true);
    });

    it('should handle partially frozen object trees', () => {
      const obj = {
        level1: {
          level2Frozen: Object.freeze({ value: 'frozen' }),
          level2Normal: { value: 'normal' }
        }
      };

      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.level1)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2Frozen)).toBe(true);
      expect(Object.isFrozen(frozen.level1.level2Normal)).toBe(true);
    });
  });

  describe('Circular references', () => {
    it('should handle circular references without infinite loop', () => {
      // Requirement 7.5: Should not cause infinite loop with circular refs
      const obj: any = { name: 'parent' };
      obj.self = obj;

      expect(() => {
        deepFreeze(obj);
      }).not.toThrow();

      expect(Object.isFrozen(obj)).toBe(true);
      expect(obj.self).toBe(obj);
    });

    it('should handle mutual circular references', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2' };
      obj1.ref = obj2;
      obj2.ref = obj1;

      expect(() => {
        deepFreeze(obj1);
      }).not.toThrow();

      expect(Object.isFrozen(obj1)).toBe(true);
      expect(Object.isFrozen(obj2)).toBe(true);
      expect(obj1.ref).toBe(obj2);
      expect(obj2.ref).toBe(obj1);
    });

    it('should handle complex circular structures', () => {
      const root: any = { name: 'root', children: [] };
      const child1: any = { name: 'child1', parent: root };
      const child2: any = { name: 'child2', parent: root };
      root.children.push(child1, child2);

      expect(() => {
        deepFreeze(root);
      }).not.toThrow();

      expect(Object.isFrozen(root)).toBe(true);
      expect(Object.isFrozen(root.children)).toBe(true);
      expect(Object.isFrozen(child1)).toBe(true);
      expect(Object.isFrozen(child2)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const obj = { value: null };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(frozen.value).toBe(null);
    });

    it('should handle undefined values', () => {
      const obj = { value: undefined };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(frozen.value).toBe(undefined);
    });

    it('should handle empty objects', () => {
      const obj = {};
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('should handle empty arrays', () => {
      const arr: any[] = [];
      const frozen = deepFreeze(arr);

      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('should handle objects with symbol properties', () => {
      const sym = Symbol('test');
      const obj = { [sym]: 'value', normal: 'prop' };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect((frozen as any)[sym]).toBe('value');
    });

    it('should handle Date objects', () => {
      const date = new Date();
      const obj = { timestamp: date };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.timestamp)).toBe(true);
    });

    it('should handle RegExp objects', () => {
      const regex = /test/g;
      const obj = { pattern: regex };
      const frozen = deepFreeze(obj);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.pattern)).toBe(true);
    });
  });
});
