/**
 * LRU eviction with size tracking.
 * Enforces 500MB max cache size per project per D-13.
 */

import { createLogger } from '../logging/index.js';
import type { CacheStore } from './store.js';

const logger = createLogger('cache:lru');

/**
 * LRU Cache entry with size tracking.
 */
export interface LRUEntry<T = unknown> {
  key: string;
  value: T;
  size: number;
  createdAt: number;
  accessedAt: number;
}

/**
 * Options for LRUCache.
 */
export interface LRUCacheOptions<T = unknown> {
  /** Maximum cache size in bytes (default: 500MB) */
  maxSize: number;
  /** Cache store instance for persistence */
  store: CacheStore;
  /** Callback when entry is evicted */
  onEvict?: (key: string, entry: LRUEntry<T>) => void;
}

/**
 * LRU Cache implementation with size-based eviction.
 * Uses a Map for O(1) access and a doubly-linked list for O(1) LRU ordering.
 */
export class LRUCache<T = unknown> {
  private maxSize: number;
  private store: CacheStore;
  private onEvict?: (key: string, entry: LRUEntry<T>) => void;
  private cache: Map<string, LRUNode<T>> = new Map();
  private head: LRUNode<T> | null = null;
  private tail: LRUNode<T> | null = null;
  private currentSize: number = 0;

  constructor(options: LRUCacheOptions<T>) {
    this.maxSize = options.maxSize;
    this.store = options.store;
    this.onEvict = options.onEvict as (key: string, entry: LRUEntry<T>) => undefined | undefined;
  }

  /**
   * Gets a value from the cache, updating its access time.
   */
  async get(key: string): Promise<T | undefined> {
    const node = this.cache.get(key);
    if (!node) {
      // Try to load from store
      const entry = await this.store.get(key);
      if (entry) {
        return await this.set(key, entry.value as T, entry.size);
      }
      return undefined;
    }

    // Move to head (most recently used)
    this.moveToHead(node);
    node.entry.accessedAt = Date.now();
    return node.entry.value;
  }

  /**
   * Sets a value in the cache, evicting LRU entries if necessary.
   */
  async set(key: string, value: T, size?: number): Promise<T> {
    // Calculate size if not provided
    const entrySize = size ?? this.calculateSize(value);

    // Check if we need to evict
    while (this.currentSize + entrySize > this.maxSize && this.tail) {
      await this.evictLRU();
    }

    // If still too large after eviction, reject
    if (this.currentSize + entrySize > this.maxSize) {
      throw new Error(`Entry size ${entrySize} exceeds max cache size ${this.maxSize}`);
    }

    let node = this.cache.get(key);
    if (node) {
      // Update existing entry
      this.currentSize -= node.entry.size;
      node.entry.value = value;
      node.entry.size = entrySize;
      node.entry.accessedAt = Date.now();
      this.currentSize += entrySize;
      this.moveToHead(node);
    } else {
      // Create new entry
      const entry: LRUEntry<T> = {
        key,
        value,
        size: entrySize,
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      node = new LRUNode(entry);
      this.cache.set(key, node);
      this.addToHead(node);
      this.currentSize += entrySize;
    }

    // Persist to store
    await this.store.set(key, value);

    return value;
  }

  /**
   * Deletes an entry from the cache.
   */
  async delete(key: string): Promise<boolean> {
    const node = this.cache.get(key);
    if (!node) {
      return await this.store.delete(key);
    }

    this.removeNode(node);
    this.cache.delete(key);
    this.currentSize -= node.entry.size;

    await this.store.delete(key);
    return true;
  }

  /**
   * Checks if a key exists in the cache.
   */
  async has(key: string): Promise<boolean> {
    if (this.cache.has(key)) {
      return true;
    }
    return await this.store.has(key);
  }

  /**
   * Gets the current cache size in bytes.
   */
  getCurrentSize(): number {
    return this.currentSize;
  }

  /**
   * Gets the maximum cache size in bytes.
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Evicts the least recently used entry.
   */
  private async evictLRU(): Promise<void> {
    if (!this.tail) return;

    const node = this.tail;
    this.removeNode(node);
    this.cache.delete(node.entry.key);
    this.currentSize -= node.entry.size;

    await this.store.delete(node.entry.key);

    if (this.onEvict) {
      this.onEvict(node.entry.key, node.entry);
    }

    logger.debug(
      { key: node.entry.key, size: node.entry.size, remainingSize: this.currentSize },
      'LRU entry evicted'
    );
  }

  /**
   * Calculates the size of a value in bytes.
   */
  private calculateSize(value: T): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  }

  /**
   * Adds a node to the head of the list (most recently used).
   */
  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;

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
  private removeNode(node: LRUNode<T>): void {
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
   * Moves a node to the head of the list.
   */
  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }
}

/**
 * Doubly-linked list node for LRU ordering.
 */
class LRUNode<T> {
  entry: LRUEntry<T>;
  prev: LRUNode<T> | null = null;
  next: LRUNode<T> | null = null;

  constructor(entry: LRUEntry<T>) {
    this.entry = entry;
  }
}

/**
 * Creates an LRUCache instance.
 */
export function createLRUCache<T = unknown>(options: LRUCacheOptions<T>): LRUCache<T> {
  return new LRUCache<T>(options);
}
