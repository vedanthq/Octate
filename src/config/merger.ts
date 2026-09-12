import { createLogger } from '../logging/index.js';
import { loadGlobalConfig, loadProjectConfig } from './loader.js';
import { DefaultConfig, type OctateConfig, OctateConfigSchema } from './schema.js';

const logger = createLogger('config:merger');

/**
 * Converts snake_case to camelCase.
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Parses environment variables following the OCTATE_<SECTION>_<KEY> convention.
 * Example: OCTATE_REVIEW_SEVERITY=high -> { review: { severity: 'high' } }
 * Example: OCTATE_REVIEW_MAX_FINDINGS=75 -> { review: { maxFindings: 75 } }
 */
export function parseEnvConfig(): Partial<OctateConfig> {
  const prefix = 'OCTATE_';
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || value === undefined) continue;

    const withoutPrefix = key.slice(prefix.length);
    const firstUnderscore = withoutPrefix.indexOf('_');
    if (firstUnderscore === -1) continue; // No section

    const section = withoutPrefix.slice(0, firstUnderscore).toLowerCase();
    const keyPart = withoutPrefix.slice(firstUnderscore + 1);
    const camelKey = toCamelCase(keyPart.toLowerCase());

    if (!(section in result)) {
      result[section] = {};
    }
    const sectionObj = result[section] as Record<string, unknown>;

    // Try to parse as JSON, fallback to string
    let parsed: unknown = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      // Keep as string
    }
    sectionObj[camelKey] = parsed;
  }

  return result as Partial<OctateConfig>;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Merges configuration layers with explicit precedence:
 * defaults → global → project → env → CLI
 * Later layers override earlier ones.
 */
export function mergeConfigs(
  defaults: OctateConfig,
  global: OctateConfig,
  project: OctateConfig,
  env: DeepPartial<OctateConfig>,
  cli: DeepPartial<OctateConfig>
): OctateConfig {
  logger.debug(
    {
      hasGlobal: global !== DefaultConfig,
      hasProject: project !== DefaultConfig,
      envKeys: Object.keys(env),
      cliKeys: Object.keys(cli),
    },
    'Merging config layers'
  );

  // Deep merge helper
  function deepMerge<T extends Record<string, unknown>>(
    target: T,
    ...sources: Array<Record<string, unknown> | undefined>
  ): T {
    const result = { ...target };
    for (const source of sources) {
      if (!source) continue;
      for (const [key, value] of Object.entries(source)) {
        if (
          value !== null &&
          value !== undefined &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          key in result &&
          typeof result[key] === 'object' &&
          !Array.isArray(result[key])
        ) {
          (result as Record<string, unknown>)[key] = deepMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>
          );
        } else if (value !== undefined && value !== null) {
          (result as Record<string, unknown>)[key] = value;
        }
      }
    }
    return result;
  }

  const merged = deepMerge({ ...defaults }, global, project, env, cli);

  // Validate final merged config
  const validated = OctateConfigSchema.parse(merged);
  logger.info({ projectName: validated.project.name }, 'Config merged and validated');
  return validated;
}

/**
 * High-level config loading with full precedence chain.
 * Loads defaults, global, project, parses env, and merges with CLI overrides.
 */
export interface ConfigMergerOptions {
  configPath?: string | undefined;
  projectConfig?: OctateConfig;
  globalConfig?: OctateConfig;
  envConfig?: DeepPartial<OctateConfig>;
  cliConfig?: DeepPartial<OctateConfig>;
}

export async function loadConfig(options: ConfigMergerOptions = {}): Promise<OctateConfig> {
  const {
    configPath,
    projectConfig = await loadProjectConfig(configPath),
    globalConfig = await loadGlobalConfig(),
    envConfig = parseEnvConfig(),
    cliConfig = {},
  } = options;

  return mergeConfigs(DefaultConfig, globalConfig, projectConfig, envConfig, cliConfig);
}

// Re-export for convenience
export { loadGlobalConfig, loadProjectConfig } from './loader.js';
