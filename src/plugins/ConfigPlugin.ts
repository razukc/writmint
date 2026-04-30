import { PluginDefinition, RuntimeContext } from '../types.js';

export interface ConfigPluginOptions {
    validate?: (config: any) => boolean | Promise<boolean>;
}

export const ConfigPlugin: PluginDefinition = {
    name: 'config',
    version: '1.0.0',
    async setup(ctx: RuntimeContext) {
        // Use host config if valid, otherwise fallback to internal state
        // We do not modify ctx.host as it might be frozen
        const host = (ctx as any).host;
        const configSource = host.config || {};

        // Core Config Actions

        ctx.actions.registerAction({
            id: 'config:get',
            handler: async (key?: string) => {
                const config = configSource;
                if (key) {
                    return config[key];
                }
                return config;
            }
        });

        ctx.actions.registerAction({
            id: 'config:set',
            handler: async (payload: Record<string, any>) => {
                const config = configSource;
                Object.assign(config, payload);
                return config;
            }
        });

        ctx.actions.registerAction({
            id: 'config:validate',
            handler: async () => {
                // If a validation function was injected into hostContext by the generic bootstrap, run it.
                const validator = (ctx as any).host._configValidator;
                if (typeof validator === 'function') {
                    return await validator((ctx as any).host.config);
                }
                return true; // No validator means valid
            }
        });
    }
};
