/**
 * Public cache API.
 * Exports all cache layer functionality.
 */

export {
  type CachePaths,
  computeConfigHash,
  computeProjectIdentity,
  getCacheDir,
  getGlobalCacheDir,
} from './identity.js';

export {
  type CacheKey,
  type CacheKeyComponents,
  createAnalysisCacheKey,
  createIndexCacheKey,
  generateCacheKey,
  generateContentHash,
  isValidCacheKey,
  parseCacheKey,
} from './keys.js';
export {
  CacheEntryLRUCache,
  createCacheEntryLRUCache,
  createLRUCache,
  LRUCache,
} from './lru.js';
export { PromisePool } from './pool.js';
export {
  type CacheEntry,
  CacheStore,
  type CacheStoreOptions,
  createCacheStore,
} from './store.js';
