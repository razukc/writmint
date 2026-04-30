import { UIProvider, ScreenDefinition, Logger, ValidationError, DuplicateRegistrationError } from './types.js';

/**
 * UIBridge manages optional UI provider registration and screen rendering.
 * Validates provider implements required methods and rejects duplicate registration.
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5
 */
export class UIBridge<TConfig = Record<string, unknown>> {
  private provider: UIProvider<TConfig> | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a UI provider with the runtime.
   * @throws ValidationError if provider is missing required methods
   * @throws DuplicateRegistrationError if provider is already registered
   * @see Requirements 9.1, 9.2, 9.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.2, 15.3, 15.4, 15.5
   */
  setProvider(provider: UIProvider<TConfig>): void {
    // Reject duplicate provider registration
    if (this.provider !== null) {
      throw new DuplicateRegistrationError('UIProvider', 'default');
    }

    // Validate provider has required methods
    if (typeof provider.mount !== 'function') {
      throw new ValidationError('UIProvider', 'mount');
    }

    if (typeof provider.renderScreen !== 'function') {
      throw new ValidationError('UIProvider', 'renderScreen');
    }

    this.provider = provider;
  }

  /**
   * Get the registered UI provider.
   * @returns The registered UIProvider or null if none registered
   */
  getProvider(): UIProvider<TConfig> | null {
    return this.provider;
  }

  /**
   * Render a screen using the registered UI provider.
   * @throws Error if no UI provider is registered
   * @see Requirements 9.2
   */
  renderScreen(screen: ScreenDefinition): unknown {
    if (this.provider === null) {
      throw new Error('No UI provider registered');
    }

    return this.provider.renderScreen(screen);
  }

  /**
   * Shutdown the UI provider by calling unmount if it exists.
   * @see Requirements 9.5
   */
  async shutdown(): Promise<void> {
    if (this.provider?.unmount) {
      try {
        await Promise.resolve(this.provider.unmount());
        this.logger.debug('UI provider unmounted');
      } catch (error) {
        this.logger.error('UI provider unmount failed', error);
      }
    }
    this.provider = null;
  }

  /**
   * Clear the UI provider during shutdown.
   */
  clear(): void {
    this.provider = null;
  }
}
