import { describe, it, expect, vi } from 'vitest';
import { Runtime } from '../../src/runtime.js';
import { PluginDefinition } from '../../src/types.js';

describe('Plugin Config Validation', () => {
    it('should initialize successfully if validateConfig returns true', async () => {
        const runtime = new Runtime();
        const plugin: PluginDefinition = {
            name: 'valid-plugin',
            version: '1.0.0',
            validateConfig: (config) => true,
            setup: vi.fn()
        };
        runtime.registerPlugin(plugin);
        await expect(runtime.initialize()).resolves.toBeUndefined();
        expect(plugin.setup).toHaveBeenCalled();
    });

    it('should throw ValidationError if validateConfig returns false', async () => {
        const runtime = new Runtime();
        const plugin: PluginDefinition = {
            name: 'invalid-plugin',
            version: '1.0.0',
            validateConfig: (config) => false,
            setup: vi.fn()
        };
        runtime.registerPlugin(plugin);
        await expect(runtime.initialize()).rejects.toThrow(/\[validation\.invalid_field\].*Plugin\[invalid-plugin\]\.config \(config validation failed\)/);
        expect(plugin.setup).not.toHaveBeenCalled();
    });

    it('should throw ValidationError with custom errors if validateConfig returns object', async () => {
        const runtime = new Runtime();
        const plugin: PluginDefinition = {
            name: 'detailed-invalid-plugin',
            version: '1.0.0',
            validateConfig: (config) => ({
                valid: false,
                errors: ['key1 is missing', 'key2 is invalid']
            }),
            setup: vi.fn()
        };
        runtime.registerPlugin(plugin);
        await expect(runtime.initialize()).rejects.toThrow(/config \(key1 is missing, key2 is invalid\)/);
    });

    it('should support async validation', async () => {
        const runtime = new Runtime();
        const plugin: PluginDefinition = {
            name: 'async-plugin',
            version: '1.0.0',
            validateConfig: async (config) => {
                await new Promise(r => setTimeout(r, 10));
                return true;
            },
            setup: vi.fn()
        };
        runtime.registerPlugin(plugin);
        await expect(runtime.initialize()).resolves.toBeUndefined();
        expect(plugin.setup).toHaveBeenCalled();
    });

    it('should handle thrown errors in validateConfig', async () => {
        const runtime = new Runtime();
        const plugin: PluginDefinition = {
            name: 'crashy-plugin',
            version: '1.0.0',
            validateConfig: () => { throw new Error('Crashed'); },
            setup: vi.fn()
        };
        runtime.registerPlugin(plugin);
        await expect(runtime.initialize()).rejects.toThrow('Crashed');
    });
});
