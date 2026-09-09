/**
 * Cache key generation with all required components.
 * Key format: SHA256(content) + relativePath + parserVersion + language + configHash
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnWithSignal } from '../cancellation/subprocess.js';

/**
 * Components that make up a cache key.
 */
export interface CacheKeyComponents {
  contentHash: string;
  filePath: string;
  parserVersion: string;
  language: string;
  configHash: string;
}

/**
 * Generates a cache key from a parts object.
 * Uses SHA256 of JSON-serialized sorted parts for deterministic keys.
 */
export function cacheKey(parts: Record<string, string>): string {
  const sortedKeys = Object.keys(parts).sort();
  const serialized = sortedKeys.map((k) => `${k}:${parts[k]}`).join('|');
  return createHash('sha256').update(serialized).digest('hex').substring(0, 32);
}

/**
 * Generates a content hash from string content.
 */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Parsed cache key.
 */
export interface CacheKey {
  contentHash: string;
  filePath: string;
  parserVersion: string;
  language: string;
  configHash: string;
  fullKey: string;
}

/**
 * Generates a cache key from components.
 * Format: {contentHash}:{filePath}:{parserVersion}:{language}:{configHash}
 */
export function generateCacheKey(components: CacheKeyComponents): string {
  const { contentHash, filePath, parserVersion, language, configHash } = components;
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `${contentHash}:${normalizedPath}:${parserVersion}:${language}:${configHash}`;
}

/**
 * Generates a content hash from file content.
 */
export function generateContentHash(content: string | Buffer): string {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
}

/**
 * Parses a cache key back into components.
 */
export function parseCacheKey(key: string): CacheKey | null {
  const parts = key.split(':');
  if (parts.length !== 5) return null;

  const contentHash = parts[0];
  const filePath = parts[1];
  const parserVersion = parts[2];
  const language = parts[3];
  const configHash = parts[4];

  if (!contentHash || !filePath || !parserVersion || !language || !configHash) {
    return null;
  }

  return {
    contentHash,
    filePath,
    parserVersion,
    language,
    configHash,
    fullKey: key,
  };
}

/**
 * Creates a cache key for analysis results.
 */
export function createAnalysisCacheKey(
  content: string | Buffer,
  filePath: string,
  parserVersion: string,
  language: string,
  configHash: string
): string {
  const contentHash = generateContentHash(content);
  return generateCacheKey({ contentHash, filePath, parserVersion, language, configHash });
}

/**
 * Creates a cache key for index entries (symbols, references, etc.).
 */
export function createIndexCacheKey(
  identifier: string,
  parserVersion: string,
  language: string,
  configHash: string
): string {
  const contentHash = createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  return generateCacheKey({
    contentHash,
    filePath: identifier,
    parserVersion,
    language,
    configHash,
  });
}

/**
 * Validates that a cache key is well-formed.
 */
export function isValidCacheKey(key: string): boolean {
  return parseCacheKey(key) !== null;
}

/**
 * Tool version cache to avoid repeated subprocess calls.
 */
const toolVersionCache = new Map<string, string>();

/**
 * Gets the version of a tool by running its version command.
 * Caches the result to avoid repeated subprocess calls.
 */
export async function getToolVersion(toolName: string, repoRoot: string): Promise<string> {
  if (toolVersionCache.has(toolName)) {
    return toolVersionCache.get(toolName)!;
  }

  const versionCommands: Record<string, { cmd: string; args: string[] }> = {
    tsc: { cmd: 'npx', args: ['tsc', '--version'] },
    biome: { cmd: 'npx', args: ['biome', '--version'] },
    ruff: { cmd: 'ruff', args: ['--version'] },
    mypy: { cmd: 'mypy', args: ['--version'] },
    pyright: { cmd: 'pyright', args: ['--version'] },
    bandit: { cmd: 'bandit', args: ['--version'] },
    pytest: { cmd: 'pytest', args: ['--version'] },
  };

  const spec = versionCommands[toolName];
  if (!spec) {
    toolVersionCache.set(toolName, 'unknown');
    return 'unknown';
  }

  try {
    const result = await spawnWithSignal(spec.cmd, spec.args, { cwd: repoRoot });
    const version = result.stdout.trim().split('\n')[0];
    toolVersionCache.set(toolName, version);
    return version;
  } catch {
    toolVersionCache.set(toolName, 'unknown');
    return 'unknown';
  }
}

/**
 * Generates a config version hash from all config files in the repository.
 * Used to invalidate cache when configuration changes.
 */
export async function configVersion(repoRoot: string): Promise<string> {
  const configFiles = [
    'tsconfig.json',
    'biome.json',
    'biome.jsonc',
    '.biome.json',
    'ruff.toml',
    'pyproject.toml',
    'pyrightconfig.json',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    'package.json',
  ];

  const hashes: string[] = [];

  for (const configFile of configFiles) {
    const filePath = resolve(repoRoot, configFile);
    try {
      const content = await readFile(filePath, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex').substring(0, 16);
      hashes.push(`${configFile}:${hash}`);
    } catch {
      // File doesn't exist, skip
    }
  }

  if (hashes.length === 0) {
    return 'no-config';
  }

  hashes.sort(); // Deterministic ordering
  return createHash('sha256').update(hashes.join('|')).digest('hex').substring(0, 16);
}

/**
 * Generates a cache key for full diagnostic collection.
 * Includes combined file content hashes, tool list, and config version.
 */
export async function diagnosticsKey(
  filePaths: string[],
  repoRoot: string,
  tools: string[],
  configVersion: string
): Promise<string> {
  // Sort for determinism
  const sortedFiles = [...filePaths].sort();
  const sortedTools = [...tools].sort();

  // Compute combined content hash of all files
  const hashes = await Promise.all(
    sortedFiles.map(async (f) => {
      try {
        const content = await readFile(resolve(repoRoot, f), 'utf-8');
        return contentHash(content);
      } catch {
        return 'missing';
      }
    })
  );

  const combinedHash = contentHash(hashes.join('|'));

  const parts = {
    filesHash: combinedHash,
    fileCount: String(sortedFiles.length),
    tools: sortedTools.join(','),
    configVersion,
  };

  return cacheKey(parts);
}

/**
 * Generates a cache key for individual tool result.
 * Includes tool name, tool version, combined file content hashes, and config version.
 */
export async function toolResultKey(
  toolName: string,
  filePaths: string[],
  repoRoot: string,
  toolVersion: string,
  configVersion: string
): Promise<string> {
  const sortedFiles = [...filePaths].sort();
  const hashes = await Promise.all(
    sortedFiles.map(async (f) => {
      try {
        const content = await readFile(resolve(repoRoot, f), 'utf-8');
        return contentHash(content);
      } catch {
        return 'missing';
      }
    })
  );
  const combinedHash = contentHash(hashes.join('|'));

  const parts = {
    tool: toolName,
    toolVersion,
    filesHash: combinedHash,
    fileCount: String(sortedFiles.length),
    configVersion,
  };

  return cacheKey(parts);
}
