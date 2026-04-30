import { describe, it, expect, vi } from 'vitest';
import { ServiceRegistry } from '../../src/service-registry.js';
import { ConsoleLogger, DuplicateRegistrationError } from '../../src/types.js';

describe('ServiceRegistry', () => {
    const logger = new ConsoleLogger();

    it('should register and get a service', () => {
        const registry = new ServiceRegistry(logger);
        const service = { foo: 'bar' };
        registry.register('test', service);
        expect(registry.get('test')).toBe(service);
    });

    it('should throw DuplicateRegistrationError if service already exists', () => {
        const registry = new ServiceRegistry(logger);
        registry.register('test', { a: 1 });
        expect(() => registry.register('test', { b: 2 })).toThrow(DuplicateRegistrationError);
    });

    it('should throw error if service not found', () => {
        const registry = new ServiceRegistry(logger);
        expect(() => registry.get('missing')).toThrow('Service "missing" not found');
    });

    it('should check if service exists using has()', () => {
        const registry = new ServiceRegistry(logger);
        registry.register('test', { a: 1 });
        expect(registry.has('test')).toBe(true);
        expect(registry.has('missing')).toBe(false);
    });

    it('should list all registered services', () => {
        const registry = new ServiceRegistry(logger);
        registry.register('s1', {});
        registry.register('s2', {});
        expect(registry.list()).toEqual(['s1', 's2']);
    });

    it('should clear all services', () => {
        const registry = new ServiceRegistry(logger);
        registry.register('test', {});
        registry.clear();
        expect(registry.has('test')).toBe(false);
        expect(registry.list()).toHaveLength(0);
    });
});
