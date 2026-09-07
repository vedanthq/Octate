/**
 * Public cache API.
 * Re-exports all cache modules for convenient imports.
 */

export {
  type CachePaths,
  computeProjectIdentity,
  ensureCacheDirs,
  getCacheDir,
  initializeProjectCache,
  resolveCachePaths,
} from './identity.js';

export {
  type CacheKey,
  computeConfigHash,
  computeContentHash,
  generateCacheKey,
  generateCacheKeyFromContent,
  isValidCacheKey,
  parseCacheKey,
} from './keys.js';
export {
  createLRUCache,
  LRUCache,
  type LRUCacheOptions,
  type LRUEntry,
} from './lru.js';
export {
  type CacheEntry,
  CacheStore,
  type CacheStoreOptions,
  createCacheStore,
} from './store.js';

// Re-export PromisePool from p-limit for bounded concurrency (CACHE-02)
import pLimit from 'p-limit';

/**
 * PromisePool provides bounded concurrency for parallel operations.
 * Wraps p-limit to provide a more ergonomic API.
 */
export class PromisePool {
  private limit: ReturnType<typeof pLimit>;

  constructor(concurrency?: number) {
    this.limit = pLimit(concurrency ?? navigator?.hardwareConcurrency ?? 4);
  }

  /**
   * Adds a task to the pool.
   * Returns a promise that resolves when the task completes.
   */
  add<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /**
   * Adds multiple tasks and waits for all to complete.
   */
  addAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(fns.map((fn) => this.add(fn)));
  }

  /**
   * Gets the current concurrency limit.
   */
  getConcurrency(): number {
    return this.limit.concurrency;
  }

  /**
   * Gets the number of pending tasks.
   */
  getPendingCount(): number {
    return this.limit.pendingCount;
  }

  /**
   * Gets the number of active tasks.
   */
  getActiveCount(): number {
    return this.limit.activeCount;
  }
}

/**
 * Creates a PromisePool with the given concurrency.
 */
export function createPromisePool(concurrency?: number): PromisePool {
  return new PromisePool(concurrency);
}
