/**
 * Cache key generation with all required components.
 * Key format: SHA256(content) + relativePath + parserVersion + language + configHash
 * Per D-11: Automatic invalidation via configHash in key + explicit octate index --force per D-12
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../logging/index.js';

const logger = createLogger('cache:keys');

/**
 * Represents a parsed cache key.
 */
export interface CacheKey {
  /** SHA256 hash of file content */
  contentHash: string;
  /** Relative file path from repo root */
  filePath: string;
  /** Parser version used */
  parserVersion: string;
  /** Programming language */
  language: string;
  /** Configuration hash */
  configHash: string;
  /** Full composite key */
  fullKey: string;
}

/**
 * Generates a cache key from components.
 * Format: {contentHash}:{filePath}:{parserVersion}:{language}:{configHash}
 */
export function generateCacheKey(
  contentHash: string,
  filePath: string,
  parserVersion: string,
  language: string,
  configHash: string
): string {
  // Normalize file path to use forward slashes
  const normalizedPath = filePath.split('\\').join('/');
  return `${contentHash}:${normalizedPath}:${parserVersion}:${language}:${configHash}`;
}

/**
 * Parses a cache key into its components.
 */
export function parseCacheKey(fullKey: string): CacheKey | null {
  const parts = fullKey.split(':');
  if (parts.length !== 5) {
    logger.warn({ fullKey }, 'Invalid cache key format');
    return null;
  }
  // parts.length === 5 guaranteed, so all indices exist
  return {
    contentHash: parts[0]!,
    filePath: parts[1]!,
    parserVersion: parts[2]!,
    language: parts[3]!,
    configHash: parts[4]!,
    fullKey,
  };
}

/**
 * Computes SHA256 hash of content.
 */
export function computeContentHash(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content);
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

/**
 * Computes a hash of the configuration object.
 * Used for automatic cache invalidation when config changes.
 */
export function computeConfigHash(config: unknown): string {
  const hash = createHash('sha256');
  // Use JSON.stringify with stable key ordering
  const json = JSON.stringify(config, Object.keys(config as object).sort());
  hash.update(json);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Generates a cache key from file content and metadata.
 * Convenience function that computes content hash and generates full key.
 */
export function generateCacheKeyFromContent(
  content: string | Uint8Array,
  filePath: string,
  parserVersion: string,
  language: string,
  configHash: string
): string {
  const contentHash = computeContentHash(content);
  return generateCacheKey(contentHash, filePath, parserVersion, language, configHash);
}

/**
 * Validates a cache key format.
 */
export function isValidCacheKey(key: string): boolean {
  const parsed = parseCacheKey(key);
  if (!parsed) return false;
  // Validate contentHash is 64 hex chars (SHA256)
  if (!/^[a-f0-9]{64}$/.test(parsed.contentHash)) return false;
  // Validate configHash is 16 hex chars (truncated SHA256)
  if (!/^[a-f0-9]{16}$/.test(parsed.configHash)) return false;
  // filePath should not be empty
  if (!parsed.filePath) return false;
  return true;
}
