import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { createLogger } from '../logging/index.js';
import { DefaultConfig, type OctateConfig, OctateConfigSchema } from './schema.js';

const logger = createLogger('config:loader');

/**
 * Finds the project config file (octate.yaml) by walking up from the given directory.
 * Returns the absolute path to the config file, or null if not found.
 */
export async function findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = resolve(startDir);
  const rootDir = resolve('/');

  while (true) {
    const configPath = join(currentDir, 'octate.yaml');
    try {
      const { stat } = await import('node:fs/promises');
      await stat(configPath);
      return configPath;
    } catch {
      // File doesn't exist, continue walking up
    }

    if (currentDir === rootDir) {
      break;
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Loads and validates the project config from octate.yaml.
 * Returns the parsed config or DefaultConfig if file doesn't exist.
 * Throws ConfigurationError if file exists but is invalid.
 */
export async function loadProjectConfig(configPath?: string): Promise<OctateConfig> {
  const filePath = configPath ?? (await findConfigFile());

  if (!filePath) {
    logger.debug('No project config file found, using defaults');
    return DefaultConfig;
  }

  logger.debug({ filePath }, 'Loading project config');

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parse(content);
    const validated = OctateConfigSchema.parse(parsed);
    logger.info({ filePath }, 'Project config loaded successfully');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.error({ filePath, issues }, 'Project config validation failed');
      throw new Error(`Invalid octate.yaml: ${issues}`);
    }
    logger.error({ filePath, error: String(error) }, 'Failed to load project config');
    throw error;
  }
}

/**
 * Loads the global config from ~/.config/octate/config.yaml (XDG standard).
 * Returns the parsed config or DefaultConfig if file doesn't exist.
 */
export async function loadGlobalConfig(): Promise<OctateConfig> {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) {
    logger.debug('No home directory found, skipping global config');
    return DefaultConfig;
  }

  const configDir = process.env.XDG_CONFIG_HOME ?? join(homeDir, '.config');
  const configPath = join(configDir, 'octate', 'config.yaml');

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parse(content);
    const validated = OctateConfigSchema.parse(parsed);
    logger.info({ configPath }, 'Global config loaded successfully');
    return validated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('No global config file found, using defaults');
      return DefaultConfig;
    }
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.warn({ configPath, issues }, 'Global config validation failed, using defaults');
      return DefaultConfig;
    }
    logger.warn(
      { configPath, error: String(error) },
      'Failed to load global config, using defaults'
    );
    return DefaultConfig;
  }
}
