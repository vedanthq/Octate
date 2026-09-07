/**
 * Tests for cache key generation and parsing.
 */

import { describe, expect, it } from '@jest/globals';
import {
  createAnalysisCacheKey,
  createIndexCacheKey,
  generateCacheKey,
  generateContentHash,
  isValidCacheKey,
  parseCacheKey,
} from './keys.js';

describe('generateContentHash', () => {
  it('generates consistent hash for same content', () => {
    const content = 'test content';
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
  });

  it('generates different hashes for different content', () => {
    const hash1 = generateContentHash('content1');
    const hash2 = generateContentHash('content2');
    expect(hash1).not.toBe(hash2);
  });

  it('works with Buffer input', () => {
    const content = Buffer.from('test content');
    const hash = generateContentHash(content);
    expect(hash.length).toBe(16);
  });
});

describe('generateCacheKey', () => {
  it('generates key from components', () => {
    const components = {
      contentHash: 'abc123',
      filePath: 'src/main.ts',
      parserVersion: '1.0.0',
      language: 'typescript',
      configHash: 'cfg456',
    };
    const key = generateCacheKey(components);
    expect(key).toBe('abc123:src/main.ts:1.0.0:typescript:cfg456');
  });

  it('normalizes Windows paths', () => {
    const components = {
      contentHash: 'abc123',
      filePath: 'src\\main.ts',
      parserVersion: '1.0.0',
      language: 'typescript',
      configHash: 'cfg456',
    };
    const key = generateCacheKey(components);
    expect(key).toBe('abc123:src/main.ts:1.0.0:typescript:cfg456');
  });
});

describe('parseCacheKey', () => {
  it('parses valid key', () => {
    const key = 'abc123:src/main.ts:1.0.0:typescript:cfg456';
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toBe('abc123');
    expect(parsed?.filePath).toBe('src/main.ts');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
    expect(parsed?.fullKey).toBe(key);
  });

  it('returns null for invalid key', () => {
    expect(parseCacheKey('invalid')).toBeNull();
    expect(parseCacheKey('a:b:c:d')).toBeNull();
    expect(parseCacheKey('a:b:c:d:e:f')).toBeNull();
  });
});

describe('createAnalysisCacheKey', () => {
  it('creates key for analysis', () => {
    const key = createAnalysisCacheKey('content', 'src/main.ts', '1.0.0', 'typescript', 'cfg456');
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toHaveLength(16);
    expect(parsed?.filePath).toBe('src/main.ts');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
  });
});

describe('createIndexCacheKey', () => {
  it('creates key for index', () => {
    const key = createIndexCacheKey('symbolName', '1.0.0', 'typescript', 'cfg456');
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.contentHash).toHaveLength(16);
    expect(parsed?.filePath).toBe('symbolName');
    expect(parsed?.parserVersion).toBe('1.0.0');
    expect(parsed?.language).toBe('typescript');
    expect(parsed?.configHash).toBe('cfg456');
  });
});

describe('isValidCacheKey', () => {
  it('returns true for valid key', () => {
    expect(isValidCacheKey('abc123:src/main.ts:1.0.0:typescript:cfg456')).toBe(true);
  });

  it('returns false for invalid key', () => {
    expect(isValidCacheKey('invalid')).toBe(false);
    expect(isValidCacheKey('a:b:c:d')).toBe(false);
  });
});
