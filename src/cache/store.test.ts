/**
 * Tests for file-based cache store with atomic writes.
 */

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { type CacheStore, createCacheStore } from './store.js';

const TEST_DIR = join(tmpdir(), `octate-store-test-${randomUUID()}`);

describe('CacheStore', () => {
  let store: CacheStore;
  let storeDir: string;

  beforeEach(async () => {
    storeDir = resolve(TEST_DIR, `store-${randomUUID()}`);
    store = await createCacheStore({ rootDir: storeDir, maxSize: 1024 * 1024 }); // 1MB
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('stores and retrieves values', async () => {
    await store.set('key1', { data: 'test', count: 42 });
    const entry = await store.get('key1');

    expect(entry).not.toBeNull();
    expect(entry?.value).toEqual({ data: 'test', count: 42 });
    expect(entry?.key).toBe('key1');
    expect(entry?.createdAt).toBeGreaterThan(0);
    expect(entry?.size).toBeGreaterThan(0);
  });

  it('returns null for non-existent keys', async () => {
    const entry = await store.get('nonexistent');
    expect(entry).toBeNull();
  });

  it('updates existing keys', async () => {
    await store.set('key1', { version: 1 });
    await store.set('key1', { version: 2 });

    const entry = await store.get('key1');
    expect(entry?.value).toEqual({ version: 2 });
  });

  it('deletes keys', async () => {
    await store.set('key1', 'value1');
    const deleted = await store.delete('key1');
    expect(deleted).toBe(true);

    const entry = await store.get('key1');
    expect(entry).toBeNull();
  });

  it('returns false when deleting non-existent key', async () => {
    const deleted = await store.delete('nonexistent');
    expect(deleted).toBe(false);
  });

  it('checks key existence', async () => {
    await store.set('key1', 'value1');
    expect(await store.has('key1')).toBe(true);
    expect(await store.has('nonexistent')).toBe(false);
  });

  it('tracks cache size', async () => {
    const sizeBefore = await store.getSize();
    await store.set('key1', 'x'.repeat(100));
    const sizeAfter = await store.getSize();

    expect(sizeAfter).toBeGreaterThan(sizeBefore);
  });

  it('enforces max size with LRU eviction', async () => {
    // Create a small store (5KB max)
    const smallStoreDir = resolve(TEST_DIR, `small-${randomUUID()}`);
    const smallStore = await createCacheStore({ rootDir: smallStoreDir, maxSize: 5000 }); // 5KB max

    // Add entries that exceed the limit
    await smallStore.set('key1', 'x'.repeat(2000));
    await smallStore.set('key2', 'y'.repeat(2000));
    await smallStore.set('key3', 'z'.repeat(2000)); // Should evict key1

    const size = await smallStore.getSize();
    expect(size).toBeLessThanOrEqual(5000);

    // key1 should be evicted (oldest)
    expect(await smallStore.has('key1')).toBe(false);
    expect(await smallStore.has('key2')).toBe(true);
    expect(await smallStore.has('key3')).toBe(true);
  });

  it('handles atomic writes on crash', async () => {
    await store.set('key1', 'value1');
    // Simulate crash by creating a temp file in the store directory
    const { writeFile, mkdir, readdir } = await import('node:fs/promises');
    const tempDir = join(storeDir, 'ab');
    await mkdir(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'temp.tmp12345');
    await writeFile(tempFile, 'corrupted data');

    // Normal operations should still work
    await store.set('key2', 'value2');
    const entry = await store.get('key2');
    expect(entry?.value).toBe('value2');
  });

  it('clears all entries', async () => {
    await store.set('key1', 'value1');
    await store.set('key2', 'value2');
    await store.clear();

    expect(await store.getSize()).toBe(0);
    expect(await store.has('key1')).toBe(false);
    expect(await store.has('key2')).toBe(false);
  });
});

describe('createCacheStore', () => {
  it('initializes store and returns instance', async () => {
    const storeDir = resolve(TEST_DIR, `create-${randomUUID()}`);
    const store = await createCacheStore({ rootDir: storeDir });

    await store.set('test', 'value');
    const entry = await store.get('test');
    expect(entry?.value).toBe('value');
  });
});
