/**
 * Tests for lru.ts - LRU eviction with size tracking.
 */

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createLRUCache, type LRUCache } from './lru.js';
import { type CacheStore, createCacheStore } from './store.js';

describe('cache:lru', () => {
  let testDir: string;
  let cacheDir: string;
  let store: CacheStore<string>;
  let lru: LRUCache<string>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `octate-lru-test-${randomUUID()}`);
    cacheDir = join(testDir, 'cache');
    store = createCacheStore<string>({ rootDir: cacheDir, maxSize: 1000 }); // 1KB for testing
    lru = createLRUCache<string>({ maxSize: 1000, store });
    await store.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('get and set', () => {
    it('stores and retrieves a value', async () => {
      await lru.set('key1', 'value1');
      const value = await lru.get('key1');

      expect(value).toBe('value1');
    });

    it('returns undefined for non-existent key', async () => {
      const value = await lru.get('nonexistent');
      expect(value).toBeUndefined();
    });

    it('updates existing key', async () => {
      await lru.set('key1', 'value1');
      await lru.set('key1', 'value2');
      const value = await lru.get('key1');

      expect(value).toBe('value2');
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used entry when size limit exceeded', async () => {
      // Add entries that total more than maxSize (1000 bytes)
      await lru.set('key1', 'x'.repeat(200)); // ~200 bytes
      await lru.set('key2', 'y'.repeat(200)); // ~200 bytes
      await lru.set('key3', 'z'.repeat(200)); // ~200 bytes
      await lru.set('key4', 'w'.repeat(200)); // ~200 bytes
      await lru.set('key5', 'v'.repeat(200)); // ~200 bytes = 1000 bytes total

      // key1 should be evicted (LRU)
      const key1Value = await lru.get('key1');
      expect(key1Value).toBeUndefined();

      // Others should still exist
      expect(await lru.get('key2')).toBe('y'.repeat(200));
      expect(await lru.get('key3')).toBe('z'.repeat(200));
      expect(await lru.get('key4')).toBe('w'.repeat(200));
      expect(await lru.get('key5')).toBe('v'.repeat(200));
    });

    it('does not evict recently accessed entries', async () => {
      await lru.set('key1', 'x'.repeat(200));
      await lru.set('key2', 'y'.repeat(200));
      await lru.set('key3', 'z'.repeat(200));
      await lru.set('key4', 'w'.repeat(200));

      // Access key1 to make it recently used
      await lru.get('key1');

      // Add another entry to trigger eviction
      await lru.set('key5', 'v'.repeat(200));

      // key1 should still exist (was recently accessed)
      expect(await lru.get('key1')).toBe('x'.repeat(200));

      // key2 should be evicted (LRU)
      expect(await lru.get('key2')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes entry from cache and store', async () => {
      await lru.set('key1', 'value1');
      const deleted = await lru.delete('key1');

      expect(deleted).toBe(true);
      expect(await lru.get('key1')).toBeUndefined();
      expect(await lru.has('key1')).toBe(false);
    });

    it('returns false for non-existent key', async () => {
      const deleted = await lru.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true for existing key', async () => {
      await lru.set('key1', 'value1');
      expect(await lru.has('key1')).toBe(true);
    });

    it('returns false for non-existent key', async () => {
      expect(await lru.has('nonexistent')).toBe(false);
    });
  });

  describe('size tracking', () => {
    it('tracks current size', async () => {
      expect(lru.getCurrentSize()).toBe(0);
      await lru.set('key1', 'x'.repeat(100));
      expect(lru.getCurrentSize()).toBeGreaterThan(0);
    });

    it('reduces size on delete', async () => {
      await lru.set('key1', 'x'.repeat(100));
      const sizeAfterSet = lru.getCurrentSize();
      await lru.delete('key1');
      expect(lru.getCurrentSize()).toBeLessThan(sizeAfterSet);
    });

    it('returns max size', () => {
      expect(lru.getMaxSize()).toBe(1000);
    });
  });

  describe('eviction callback', () => {
    it('calls onEvict callback when entry is evicted', async () => {
      const evictedKeys: string[] = [];
      const store2 = createCacheStore<string>({ rootDir: join(testDir, 'cache2'), maxSize: 1000 });
      const lru2 = createLRUCache<string>({
        maxSize: 1000,
        store: store2,
        onEvict: (key) => evictedKeys.push(key),
      });
      await store2.initialize();

      await lru2.set('key1', 'x'.repeat(200));
      await lru2.set('key2', 'y'.repeat(200));
      await lru2.set('key3', 'z'.repeat(200));
      await lru2.set('key4', 'w'.repeat(200));
      await lru2.set('key5', 'v'.repeat(200));

      expect(evictedKeys).toContain('key1');
    });
  });
});
