/**
 * Tests for keys.ts - Cache key generation.
 */

import { describe, expect, it } from '@jest/globals';
import {
  computeConfigHash,
  computeContentHash,
  generateCacheKey,
  generateCacheKeyFromContent,
  isValidCacheKey,
  parseCacheKey,
} from './keys.js';

describe('cache:keys', () => {
  describe('generateCacheKey', () => {
    it('generates key from components', () => {
      const key = generateCacheKey('abc123', 'src/app.ts', '1.0.0', 'typescript', 'config123');

      expect(key).toBe('abc123:src/app.ts:1.0.0:typescript:config123');
    });

    it('normalizes Windows paths to forward slashes', () => {
      const key = generateCacheKey('abc123', 'src\\app.ts', '1.0.0', 'typescript', 'config123');

      expect(key).toBe('abc123:src/app.ts:1.0.0:typescript:config123');
    });
  });

  describe('parseCacheKey', () => {
    it('parses valid key into components', () => {
      const fullKey = 'abc123:src/app.ts:1.0.0:typescript:config123';
      const parsed = parseCacheKey(fullKey);

      expect(parsed).not.toBeNull();
      expect(parsed?.contentHash).toBe('abc123');
      expect(parsed?.filePath).toBe('src/app.ts');
      expect(parsed?.parserVersion).toBe('1.0.0');
      expect(parsed?.language).toBe('typescript');
      expect(parsed?.configHash).toBe('config123');
      expect(parsed?.fullKey).toBe(fullKey);
    });

    it('returns null for invalid key format', () => {
      expect(parseCacheKey('invalid')).toBeNull();
      expect(parseCacheKey('a:b:c:d')).toBeNull();
      expect(parseCacheKey('a:b:c:d:e:f')).toBeNull();
    });
  });

  describe('computeContentHash', () => {
    it('computes SHA256 hash of string content', () => {
      const hash = computeContentHash('hello world');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('computes SHA256 hash of Uint8Array content', () => {
      const content = new TextEncoder().encode('hello world');
      const hash = computeContentHash(content);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('produces same hash for same content', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world');

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different content', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world!');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeConfigHash', () => {
    it('computes hash of config object', () => {
      const config = { option1: 'value1', option2: 42 };
      const hash = computeConfigHash(config);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('produces same hash for same config regardless of key order', () => {
      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { c: 3, a: 1, b: 2 };

      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different configs', () => {
      const hash1 = computeConfigHash({ option: 'value1' });
      const hash2 = computeConfigHash({ option: 'value2' });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateCacheKeyFromContent', () => {
    it('generates full key from content and metadata', () => {
      const key = generateCacheKeyFromContent(
        'export const x = 1;',
        'src/app.ts',
        '1.0.0',
        'typescript',
        'config123'
      );

      const parsed = parseCacheKey(key);
      expect(parsed).not.toBeNull();
      expect(parsed?.contentHash).toHaveLength(64);
      expect(parsed?.filePath).toBe('src/app.ts');
      expect(parsed?.parserVersion).toBe('1.0.0');
      expect(parsed?.language).toBe('typescript');
      expect(parsed?.configHash).toBe('config123');
    });
  });

  describe('isValidCacheKey', () => {
    it('returns true for valid key', () => {
      const key = generateCacheKeyFromContent(
        'content',
        'src/app.ts',
        '1.0.0',
        'typescript',
        'a'.repeat(16) // Valid 16-char hex config hash
      );

      expect(isValidCacheKey(key)).toBe(true);
    });

    it('returns false for invalid content hash length', () => {
      const key = 'short:src/app.ts:1.0.0:typescript:config123';
      expect(isValidCacheKey(key)).toBe(false);
    });

    it('returns false for invalid config hash length', () => {
      const contentHash = 'a'.repeat(64);
      const key = `${contentHash}:src/app.ts:1.0.0:typescript:short`;
      expect(isValidCacheKey(key)).toBe(false);
    });

    it('returns false for empty file path', () => {
      const contentHash = 'a'.repeat(64);
      const key = `${contentHash}::1.0.0:typescript:config123`;
      expect(isValidCacheKey(key)).toBe(false);
    });
  });
});
