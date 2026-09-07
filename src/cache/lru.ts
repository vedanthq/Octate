/**
 * LRU cache with size tracking for in-memory caching.
 * Used for hot cache entries to avoid filesystem access.
 */

import type { CacheEntry } from './store.js';

/**
 * LRU cache node.
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  size: number;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

/**
 * LRU cache with size limit.
 * Evicts least recently used entries when size limit is reached.
 */
export class LRUCache<K, V> {
  private maxSize: number;
  private currentSize: number = 0;
  private cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Gets a value from the cache.
   * Moves the entry to the front (most recently used).
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    // Move to front
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Sets a value in the cache.
   * Evicts LRU entries if size limit would be exceeded.
   */
  set(key: K, value: V, size: number): void {
    // Remove existing entry if present
    const existingNode = this.cache.get(key);
    if (existingNode) {
      this.currentSize -= existingNode.size;
      this.removeNode(existingNode);
    }

    // Evict if necessary
    while (this.currentSize + size > this.maxSize && this.tail) {
      this.evictLRU();
    }

    // If still too large after eviction, don't add
    if (this.currentSize + size > this.maxSize) {
      return;
    }

    // Add new node
    const node: LRUNode<K, V> = { key, value, size, prev: null, next: null };
    this.cache.set(key, node);
    this.addToFront(node);
    this.currentSize += size;
  }

  /**
   * Checks if a key exists in the cache.
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Deletes a key from the cache.
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    this.currentSize -= node.size;
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
  }

  /**
   * Gets the current size in bytes.
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Gets the maximum size in bytes.
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Gets the number of entries.
   */
  getCount(): number {
    return this.cache.size;
  }

  /**
   * Adds a node to the front of the list.
   */
  private addToFront(node: LRUNode<K, V>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Removes a node from the list.
   */
  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  /**
   * Moves a node to the front of the list.
   */
  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Evicts the least recently used entry.
   */
  private evictLRU(): void {
    if (!this.tail) return;

    const lru = this.tail;
    this.currentSize -= lru.size;
    this.removeNode(lru);
    this.cache.delete(lru.key);
  }
}

/**
 * Creates an LRU cache with the given max size in bytes.
 */
export function createLRUCache<K, V>(maxSize: number): LRUCache<K, V> {
  return new LRUCache<K, V>(maxSize);
}

/**
 * LRU cache specifically for cache entries.
 * Uses entry size for eviction decisions.
 */
export class CacheEntryLRUCache {
  private lru: LRUCache<string, CacheEntry>;

  constructor(maxSize: number) {
    this.lru = new LRUCache<string, CacheEntry>(maxSize);
  }

  get(key: string): CacheEntry | undefined {
    return this.lru.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    this.lru.set(key, entry, entry.size);
  }

  has(key: string): boolean {
    return this.lru.has(key);
  }

  delete(key: string): boolean {
    return this.lru.delete(key);
  }

  clear(): void {
    this.lru.clear();
  }

  getSize(): number {
    return this.lru.getSize();
  }

  getMaxSize(): number {
    return this.lru.getMaxSize();
  }

  getCount(): number {
    return this.lru.getCount();
  }
}

/**
 * Creates an LRU cache for cache entries with the given max size in bytes.
 */
export function createCacheEntryLRUCache(maxSize: number): CacheEntryLRUCache {
  return new CacheEntryLRUCache(maxSize);
}
