/**
 * Project identity hashing and cache directory resolution.
 * Uses SHA256(repo-root-path + git-remote-url) for namespacing.
 */

import { createHash } from 'node:crypto';
import { access, constants, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';

const _require = createRequire(import.meta.url);

/**
 * Parsed git config for remote URL extraction.
 */
interface GitConfig {
  'remote "origin"': { url?: string };
  'remote "upstream"': { url?: string };
}

/**
 * Cache directory paths structure.
 */
export interface CachePaths {
  root: string;
  indexes: string;
  cache: string;
  findings: string;
  logs: string;
}

/**
 * Computes the project identity hash from repo root and git remote URL.
 * Falls back to absolute path + device/inode if no remote URL.
 */
export async function computeProjectIdentity(repoRoot: string): Promise<string> {
  let identityString: string;

  try {
    const gitConfigPath = resolve(repoRoot, '.git', 'config');
    const configContent = await readFile(gitConfigPath, 'utf-8');

    const remoteUrl = extractRemoteUrl(configContent);
    if (remoteUrl) {
      identityString = `${repoRoot}|${remoteUrl}`;
    } else {
      identityString = await fallbackIdentity(repoRoot);
    }
  } catch {
    identityString = await fallbackIdentity(repoRoot);
  }

  return createHash('sha256').update(identityString).digest('hex').substring(0, 16);
}

/**
 * Extracts the first remote URL from git config content.
 */
function extractRemoteUrl(configContent: string): string | null {
  const lines = configContent.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      continue;
    }

    if (currentSection.startsWith('remote "') && trimmed.startsWith('url')) {
      const match = trimmed.match(/url\s*=\s*(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return null;
}

/**
 * Fallback identity when no git remote is available.
 * Uses absolute path + platform-specific device info.
 */
async function fallbackIdentity(repoRoot: string): Promise<string> {
  const absolutePath = resolve(repoRoot);
  let deviceInfo = platform();

  try {
    // Try to get device/inode info for more uniqueness
    const { stat } = await import('node:fs/promises');
    const stats = await stat(absolutePath);
    deviceInfo += `-${stats.dev}-${stats.ino}`;
  } catch {
    // Ignore errors, use platform as fallback
  }

  return `${absolutePath}|${deviceInfo}`;
}

/**
 * Gets the cache directory paths for a project.
 * Creates the directory structure if it doesn't exist.
 */
export async function getCacheDir(repoRoot: string): Promise<CachePaths> {
  const identity = await computeProjectIdentity(repoRoot);
  const baseDir = join(homedir(), '.local', 'share', 'octate', identity);

  const paths: CachePaths = {
    root: baseDir,
    indexes: join(baseDir, 'indexes'),
    cache: join(baseDir, 'cache'),
    findings: join(baseDir, 'findings'),
    logs: join(baseDir, 'logs'),
  };

  // Ensure all directories exist
  for (const dir of Object.values(paths)) {
    await ensureDir(dir);
  }

  return paths;
}

/**
 * Initializes the project cache by creating the directory structure.
 * This is a convenience function that calls getCacheDir and ensures
 * all cache directories are created.
 */
export async function initializeProjectCache(repoRoot: string): Promise<CachePaths> {
  return await getCacheDir(repoRoot);
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir, constants.F_OK);
  } catch {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Gets the global cache directory (for non-project-specific data).
 */
export function getGlobalCacheDir(): string {
  return join(homedir(), '.local', 'share', 'octate', 'global');
}

/**
 * Computes a config hash for cache key invalidation.
 * Only includes user-set values, not defaults.
 */
export function computeConfigHash(config: Record<string, unknown>): string {
  const normalized = normalizeConfigForHash(config);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').substring(0, 8);
}

/**
 * Normalizes config for hashing by removing defaults and sorting keys.
 */
function normalizeConfigForHash(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    // Skip known default values
    if (isDefaultValue(key, value)) continue;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeConfigForHash(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Checks if a config value is a known default.
 */
function isDefaultValue(key: string, value: unknown): boolean {
  const defaults: Record<string, unknown> = {
    version: '1',
    severity: 'medium',
    max_findings: 10,
    log_level: 'info',
  };

  return defaults[key] === value;
}
