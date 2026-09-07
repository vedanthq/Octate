/**
 * Public configuration API.
 * Re-exports all config modules for convenient imports.
 */

export {
  findConfigFile,
  loadGlobalConfig,
  loadProjectConfig,
} from './loader.js';
export {
  type ConfigMergerOptions,
  loadConfig,
  mergeConfigs,
  parseEnvConfig,
} from './merger.js';
export {
  type ArchitectureConfig,
  CompiledOctateConfigSchema,
  DefaultConfig,
  type OctateConfig,
  OctateConfigSchema,
  type ProjectConfig,
  type ReviewConfig,
} from './schema.js';

/**
 * Result of loading configuration with full precedence chain.
 */
export interface ConfigResult {
  config: import('./schema.js').OctateConfig;
  sources: {
    defaults: boolean;
    global: boolean;
    project: boolean;
    env: boolean;
    cli: boolean;
  };
}
