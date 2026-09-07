/**
 * Tests for LRU cache with size tracking.
 */

import { describe, expect, it } from '@jest/globals';
import { createCacheEntryLRUCache, createLRUCache } from './lru.js';

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = createLRUCache<string, string>(1000);
    cache.set('key1', 'value1', 10);
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    const cache = createLRUCache<string, string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('updates existing keys', () => {
    const cache = createLRUCache<string, string>(1000);
    cache.set('key1', 'value1', 10);
    cache.set('key1', 'value2', 10);
    expect(cache.get('key1')).toBe('value2');
    expect(cache.getSize()).toBe(10);
  });

  it('evicts LRU entries when size limit exceeded', () => {
    const cache = createLRUCache<string, string>(50);
    cache.set('key1', 'value1', 20);
    cache.set('key2', 'value2', 20);
    cache.set('key3', 'value3', 20); // Should evict key1

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
    expect(cache.has('key3')).toBe(true);
    expect(cache.getSize()).toBeLessThanOrEqual(50);
  });

  it('moves accessed entries to front', () => {
    const cache = createLRUCache<string, string>(50);
    cache.set('key1', 'value1', 15);
    cache.set('key2', 'value2', 15);
    cache.set('key3', 'value3', 15);

    // Access key1 to make it MRU
    cache.get('key1');

    // Add key4, should evict key2 (LRU)
    cache.set('key4', 'value4', 15);

    expect(cache.has('key1')).toBe(true); // MRU, not evicted
    expect(cache.has('key2')).toBe(false); // LRU, evicted
    expect(cache.has('key3')).toBe(true);
    expect(cache.has('key4')).toBe(true);
  });

  it('deletes entries', () => {
    const cache = createLRUCache<string, string>(1000);
    cache.set('key1', 'value1', 10);
    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
    expect(cache.getSize()).toBe(0);
  });

  it('returns false when deleting missing key', () => {
    const cache = createLRUCache<string, string>(1000);
    expect(cache.delete('missing')).toBe(false);
  });

  it('clears all entries', () => {
    const cache = createLRUCache<string, string>(1000);
    cache.set('key1', 'value1', 10);
    cache.set('key2', 'value2', 10);
    cache.clear();

    expect(cache.getSize()).toBe(0);
    expect(cache.getCount()).toBe(0);
    expect(cache.has('key1')).toBe(false);
  });

  it('tracks count correctly', () => {
    const cache = createLRUCache<string, string>(1000);
    expect(cache.getCount()).toBe(0);
    cache.set('key1', 'value1', 10);
    expect(cache.getCount()).toBe(1);
    cache.set('key2', 'value2', 10);
    expect(cache.getCount()).toBe(2);
    cache.delete('key1');
    expect(cache.getCount()).toBe(1);
  });

  it('respects max size', () => {
    const cache = createLRUCache<string, string>(1000);
    expect(cache.getMaxSize()).toBe(1000);
  });

  it('handles large values that exceed max size', () => {
    const cache = createLRUCache<string, string>(50);
    cache.set('key1', 'x'.repeat(100), 100); // Larger than max size

    expect(cache.has('key1')).toBe(false);
    expect(cache.getSize()).toBe(0);
  });
});

describe('CacheEntryLRUCache', () => {
  it('stores and retrieves cache entries', () => {
    const cache = createCacheEntryLRUCache(1000);
    const entry = { key: 'key1', value: 'value1', createdAt: Date.now(), size: 10 };
    cache.set('key1', entry);

    const retrieved = cache.get('key1');
    expect(retrieved).toEqual(entry);
  });

  it('uses entry size for eviction', () => {
    const cache = createCacheEntryLRUCache(50);
    cache.set('key1', { key: 'key1', value: 'x'.repeat(20), createdAt: Date.now(), size: 20 });
    cache.set('key2', { key: 'key2', value: 'y'.repeat(20), createdAt: Date.now(), size: 20 });
    cache.set('key3', { key: 'key3', value: 'z'.repeat(20), createdAt: Date.now(), size: 20 });

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
    expect(cache.has('key3')).toBe(true);
  });

  it('tracks size correctly', () => {
    const cache = createCacheEntryLRUCache(1000);
    cache.set('key1', { key: 'key1', value: 'value1', createdAt: Date.now(), size: 10 });
    cache.set('key2', { key: 'key2', value: 'value2', createdAt: Date.now(), size: 20 });

    expect(cache.getSize()).toBe(30);
    expect(cache.getCount()).toBe(2);
  });
});

describe('createLRUCache / createCacheEntryLRUCache', () => {
  it('creates cache with specified max size', () => {
    const cache1 = createLRUCache<string, number>(2048);
    expect(cache1.getMaxSize()).toBe(2048);

    const cache2 = createCacheEntryLRUCache(4096);
    expect(cache2.getMaxSize()).toBe(4096);
  });
});
