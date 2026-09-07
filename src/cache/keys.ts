/**
 * Cache key generation with all required components.
 * Key format: SHA256(content) + relativePath + parserVersion + language + configHash
 */

import { createHash } from 'node:crypto';

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

  const [contentHash, filePath, parserVersion, language, configHash] = parts;
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
