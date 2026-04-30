import { DuplicateRegistrationError, Logger } from './types.js';

/**
 * ServiceRegistry implements the Service Locator pattern.
 * It allows plugins to register and discover typed services.
 * 
 * @see v0.3 Service Locator Feature
 */
export class ServiceRegistry {
    private services = new Map<string, unknown>();
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Registers a service with a unique name.
     * @param name - Unique service identifier
     * @param service - Service implementation
     * @throws DuplicateRegistrationError if service already exists
     */
    register<T>(name: string, service: T): void {
        if (this.services.has(name)) {
            throw new DuplicateRegistrationError('Service', name);
        }

        this.services.set(name, service);
        this.logger.debug(`Service "${name}" registered`);
    }

    /**
     * Retrieves a registered service by name.
     * @param name - Unique service identifier
     * @returns The service implementation
     * @throws Error if service is not found
     */
    get<T>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not found. Ensure the providing plugin is initialized.`);
        }
        return service as T;
    }

    /**
     * Checks if a service is registered.
     * @param name - Unique service identifier
     * @returns true if service exists
     */
    has(name: string): boolean {
        return this.services.has(name);
    }

    /**
     * Lists all registered service names.
     * @returns Array of service identifiers
     */
    list(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Unregisters a service by name. Intended for use in plugin dispose.
     * No-op if the service is not registered.
     * @param name - Unique service identifier
     */
    unregister(name: string): void {
        if (this.services.has(name)) {
            this.services.delete(name);
            this.logger.debug(`Service "${name}" unregistered`);
        }
    }

    /**
     * Clears all registered services.
     */
    clear(): void {
        this.services.clear();
    }
}
