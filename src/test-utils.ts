import { Runtime } from './runtime.js';
import { Logger } from './types.js';

export class MemoryLogger implements Logger {
    public logs: { level: string, message: string, args: unknown[] }[] = [];

    debug(message: string, ...args: unknown[]) { this.logs.push({ level: 'debug', message, args }); }
    info(message: string, ...args: unknown[]) { this.logs.push({ level: 'info', message, args }); }
    warn(message: string, ...args: unknown[]) { this.logs.push({ level: 'warn', message, args }); }
    error(message: string, ...args: unknown[]) { this.logs.push({ level: 'error', message, args }); }

    clear() { this.logs = []; }
}

export interface TestRuntimeOptions {
    hostContext?: Record<string, unknown>;
}

export function createTestRuntime(options: TestRuntimeOptions = {}): Runtime {
    return new Runtime({
        logger: new MemoryLogger(),
        hostContext: options.hostContext || {},
        enablePerformanceMonitoring: false
    });
}
