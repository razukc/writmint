
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import type { PluginDefinition, Logger, PluginLoader } from './types.js';

/**
 * Plugin loader for automatic discovery and loading of plugins
 * Supports both file paths and npm packages
 */
export class DirectoryPluginLoader implements PluginLoader {
  constructor(private logger: Logger) { }

  /**
   * Load plugins from specified paths and packages
   * @param pluginPaths - Array of file paths or directory paths
   * @param pluginPackages - Array of npm package names
   * @returns Array of loaded plugin definitions
   */
  async loadPlugins(
    pluginPaths: string[] = [],
    pluginPackages: string[] = []
  ): Promise<PluginDefinition[]> {
    const plugins: PluginDefinition[] = [];
    let pathPluginCount = 0;
    let packagePluginCount = 0;

    // Load from file paths
    for (const path of pluginPaths) {
      try {
        const pathPlugins = await this.loadFromPath(path);
        pathPluginCount += pathPlugins.length;
        plugins.push(...pathPlugins);
      } catch (error) {
        this.logger.error(`Failed to load plugins from path "${path}":`, error);
      }
    }

    // Load from npm packages
    for (const packageName of pluginPackages) {
      try {
        const packagePlugin = await this.loadFromPackage(packageName);
        if (packagePlugin) {
          packagePluginCount++;
          plugins.push(packagePlugin);
        }
      } catch (error) {
        this.logger.error(`Failed to load plugin package "${packageName}":`, error);
      }
    }

    // Sort all plugins by dependencies before returning
    const sorted = this.sortPluginsByDependencies(plugins);

    // Consolidated logging: single info message with breakdown
    const breakdown = [];
    if (pathPluginCount > 0) breakdown.push(`${pathPluginCount} from paths`);
    if (packagePluginCount > 0) breakdown.push(`${packagePluginCount} from packages`);
    const details = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : '';

    this.logger.info(`Loaded ${sorted.length} plugins${details}`);

    if (sorted.length > 0) {
      this.logger.debug(`Plugin order: ${sorted.map(p => p.name).join(' → ')}`);
    }

    return sorted;
  }

  /**
   * Load plugins from a file path or directory
   */
  private async loadFromPath(path: string): Promise<PluginDefinition[]> {
    const resolvedPath = resolve(path);

    // Check if it's a single file
    if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.ts')) {
      const plugin = await this.loadPluginFile(resolvedPath);
      return plugin ? [plugin] : [];
    }

    // Treat as directory - find all plugin files
    // Force forward slashes for fast-glob compatibility
    const normalizedPath = resolvedPath.replace(/\\/g, '/');

    // Use cwd to ensure node_modules ignore only applies to subdirectories
    // fast-glob matches ignore patterns against absolute paths if the pattern is absolute
    const glob = (await import('fast-glob')).default;
    const files = await glob('**/*.{js,mjs}', {
      cwd: normalizedPath,
      absolute: true,
      ignore: ['node_modules/**', '**/node_modules/**', '**/*.test.*', '**/*.spec.*']
    });

    const plugins: PluginDefinition[] = [];
    for (const file of files) {
      const plugin = await this.loadPluginFile(file);
      if (plugin) {
        plugins.push(plugin);
      }
    }

    return this.sortPluginsByDependencies(plugins);
  }

  /**
   * Load a plugin from an npm package
   */
  private async loadFromPackage(packageName: string): Promise<PluginDefinition | null> {
    try {
      // Dynamic import of npm package
      const module = await import(packageName);

      // Look for default export or named exports that look like plugins
      const plugin = module.default || module.plugin || module;

      if (this.isValidPlugin(plugin)) {
        this.logger.debug(`Loaded plugin from package: ${packageName}`);
        return plugin;
      } else {
        this.logger.warn(`Package "${packageName}" does not export a valid plugin`);
        return null;
      }
    } catch (error) {
      throw new Error(`Cannot load package "${packageName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load a single plugin file
   */
  private async loadPluginFile(filePath: string): Promise<PluginDefinition | null> {
    try {
      // Convert to file URL for dynamic import
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);

      // Look for plugin in various export patterns
      const plugin = module.default || module.plugin || module;

      if (this.isValidPlugin(plugin)) {
        this.logger.debug(`Loaded plugin from file: ${filePath}`);
        return plugin;
      } else {
        this.logger.warn(`File "${filePath}" does not export a valid plugin`);
        return null;
      }
    } catch (error) {
      throw new Error(`Cannot load plugin file "${filePath}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that an object is a valid plugin definition
   */
  private isValidPlugin(obj: unknown): obj is PluginDefinition {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as any).name === 'string' &&
      typeof (obj as any).version === 'string' &&
      typeof (obj as any).setup === 'function'
    );
  }

  /**
   * Sort plugins by dependencies using topological sort
   * Ensures plugins are initialized in correct dependency order
   */
  private sortPluginsByDependencies(plugins: PluginDefinition[]): PluginDefinition[] {
    const pluginMap = new Map<string, PluginDefinition>();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: PluginDefinition[] = [];

    // Build plugin map
    for (const plugin of plugins) {
      pluginMap.set(plugin.name, plugin);
    }

    const visit = (pluginName: string): void => {
      if (visited.has(pluginName)) {
        return;
      }

      if (visiting.has(pluginName)) {
        this.logger.warn(`Circular dependency detected involving plugin "${pluginName}"`);
        return;
      }

      const plugin = pluginMap.get(pluginName);
      if (!plugin) {
        // Plugin not found in current batch - might be registered manually
        return;
      }

      visiting.add(pluginName);

      // Visit dependencies first
      const dependencies = plugin.dependencies || [];
      for (const dep of dependencies) {
        visit(dep);
      }

      visiting.delete(pluginName);
      visited.add(pluginName);
      sorted.push(plugin);
    };

    // Visit all plugins
    for (const plugin of plugins) {
      visit(plugin.name);
    }

    return sorted;
  }
}