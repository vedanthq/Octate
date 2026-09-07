/**
 * Tests for store.ts - File-based cache store with atomic writes.
 */

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { type CacheStore, createCacheStore } from './store.js';

describe('cache:store', () => {
  let testDir: string;
  let cacheDir: string;
  let store: CacheStore<unknown>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `octate-store-test-${randomUUID()}`);
    cacheDir = join(testDir, 'cache');
    store = createCacheStore<unknown>({ rootDir: cacheDir, maxSize: 1024 * 1024 }); // 1MB for testing
    await store.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('set and get', () => {
    it('stores and retrieves a value', async () => {
      await store.set('key1', 'value1');
      const entry = await store.get('key1');

      expect(entry).not.toBeNull();
      expect(entry?.key).toBe('key1');
      expect(entry?.value).toBe('value1');
      expect(entry?.size).toBeGreaterThan(0);
    });

    it('returns null for non-existent key', async () => {
      const entry = await store.get('nonexistent');
      expect(entry).toBeNull();
    });

    it('updates existing key', async () => {
      await store.set('key1', 'value1');
      await store.set('key1', 'value2');
      const entry = await store.get('key1');

      expect(entry?.value).toBe('value2');
    });

    it('stores complex objects', async () => {
      const obj = { foo: 'bar', baz: [1, 2, 3], nested: { a: 'b' } };
      await store.set('obj-key', obj);
      const entry = await store.get('obj-key');

      expect(entry?.value).toEqual(obj);
    });
  });

  describe('delete', () => {
    it('deletes existing key', async () => {
      await store.set('key1', 'value1');
      const deleted = await store.delete('key1');

      expect(deleted).toBe(true);
      const entry = await store.get('key1');
      expect(entry).toBeNull();
    });

    it('returns false for non-existent key', async () => {
      const deleted = await store.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true for existing key', async () => {
      await store.set('key1', 'value1');
      const exists = await store.has('key1');
      expect(exists).toBe(true);
    });

    it('returns false for non-existent key', async () => {
      const exists = await store.has('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('size tracking', () => {
    it('tracks current size', async () => {
      const initialSize = store.getCurrentSize();
      await store.set('key1', 'x'.repeat(100));
      expect(store.getCurrentSize()).toBeGreaterThan(initialSize);
    });

    it('reduces size on delete', async () => {
      await store.set('key1', 'x'.repeat(100));
      const sizeAfterSet = store.getCurrentSize();
      await store.delete('key1');
      expect(store.getCurrentSize()).toBeLessThan(sizeAfterSet);
    });

    it('returns max size', () => {
      expect(store.getMaxSize()).toBe(1024 * 1024);
    });
  });

  describe('keys', () => {
    it('lists all keys', async () => {
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      await store.set('key3', 'value3');

      const keys = await store.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('clear', () => {
    it('removes all entries', async () => {
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      await store.clear();

      const keys = await store.keys();
      expect(keys).toHaveLength(0);
      expect(store.getCurrentSize()).toBe(0);
    });
  });

  describe('atomic writes', () => {
    it('does not leave partial files on error', async () => {
      // This test verifies that temp files are cleaned up
      // We can't easily simulate a write error, but we can verify
      // that only the final file exists after successful write
      await store.set('key1', 'value1');

      const { readdir } = await import('node:fs/promises');
      const files = await readdir(cacheDir);
      const tempFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });
  });
});
