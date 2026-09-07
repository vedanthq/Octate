/**
 * File-based cache store with atomic writes.
 * Uses temp file + rename for atomicity per T-01-16 mitigation.
 */

import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '../logging/index.js';

const logger = createLogger('cache:store');

/**
 * Options for CacheStore.
 */
export interface CacheStoreOptions {
  /** Root directory for cache storage */
  rootDir: string;
  /** Maximum cache size in bytes (default: 500MB) */
  maxSize?: number;
}

/**
 * Cache entry metadata stored alongside the value.
 */
export interface CacheEntry<T = unknown> {
  /** The cache key */
  key: string;
  /** The cached value */
  value: T;
  /** Timestamp when entry was created (ms since epoch) */
  createdAt: number;
  /** Timestamp when entry was last accessed (ms since epoch) */
  accessedAt: number;
  /** Size of the value in bytes */
  size: number;
}

/**
 * File-based cache store with atomic writes and LRU eviction support.
 */
export class CacheStore<T = unknown> {
  private rootDir: string;
  private maxSize: number;
  private currentSize: number = 0;
  private initialized: boolean = false;

  constructor(options: CacheStoreOptions) {
    this.rootDir = options.rootDir;
    this.maxSize = options.maxSize ?? 500 * 1024 * 1024; // 500MB default
  }

  /**
   * Initializes the cache store by creating the root directory
   * and calculating current cache size.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mkdir(this.rootDir, { recursive: true });
    await this.calculateCurrentSize();
    this.initialized = true;
    logger.info(
      { rootDir: this.rootDir, currentSize: this.currentSize, maxSize: this.maxSize },
      'Cache store initialized'
    );
  }

  /**
   * Calculates the current cache size by scanning all files.
   */
  private async calculateCurrentSize(): Promise<void> {
    try {
      const files = await readdir(this.rootDir);
      let totalSize = 0;
      for (const file of files) {
        const filePath = join(this.rootDir, file);
        const stats = await stat(filePath);
        totalSize += stats.size;
      }
      this.currentSize = totalSize;
    } catch (error) {
      logger.warn({ error }, 'Failed to calculate cache size, assuming 0');
      this.currentSize = 0;
    }
  }

  /**
   * Gets the file path for a cache key.
   */
  private getFilePath(key: string): string {
    // Use the key directly as filename (it's already a hash-based string)
    // Replace any remaining problematic characters
    const safeKey = key.replace(/[/\\:]/g, '_');
    return join(this.rootDir, safeKey);
  }

  /**
   * Writes a cache entry atomically using temp file + rename.
   */
  async set(key: string, value: T): Promise<void> {
    await this.initialize();

    // Calculate value size separately (without metadata)
    const valueSize = Buffer.byteLength(JSON.stringify(value), 'utf-8');
    const metadataSize = 100; // Approximate overhead for key, timestamps, etc.

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      size: valueSize + metadataSize,
    };

    const serialized = JSON.stringify(entry);

    // Check if adding this entry would exceed max size
    if (this.currentSize + entry.size > this.maxSize) {
      logger.warn(
        { key, entrySize: entry.size, currentSize: this.currentSize, maxSize: this.maxSize },
        'Cache size limit would be exceeded'
      );
      // Note: LRU eviction is handled by the LRUCache wrapper
    }

    const filePath = this.getFilePath(key);
    const tempPath = `${filePath}.tmp`;

    try {
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });

      // Write to temp file
      await writeFile(tempPath, serialized, 'utf-8');

      // Atomic rename
      await rename(tempPath, filePath);

      this.currentSize += entry.size;
      logger.debug({ key, size: entry.size, currentSize: this.currentSize }, 'Cache entry written');
    } catch (error) {
      // Clean up temp file on error
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      logger.error({ key, error }, 'Failed to write cache entry');
      throw error;
    }
  }

  /**
   * Reads a cache entry.
   */
  async get(key: string): Promise<CacheEntry<T> | null> {
    await this.initialize();

    const filePath = this.getFilePath(key);

    try {
      const content = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry<T>;

      // Validate key matches
      if (entry.key !== key) {
        logger.warn({ key, storedKey: entry.key }, 'Cache key mismatch');
        return null;
      }

      // Update accessed time in the stored file
      entry.accessedAt = Date.now();
      const updatedContent = JSON.stringify(entry);
      const tempPath = `${filePath}.tmp`;
      await writeFile(tempPath, updatedContent, 'utf-8');
      await rename(tempPath, filePath);

      logger.debug({ key }, 'Cache hit');
      return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug({ key }, 'Cache miss');
        return null;
      }
      logger.error({ key, error }, 'Failed to read cache entry');
      return null;
    }
  }

  /**
   * Deletes a cache entry.
   */
  async delete(key: string): Promise<boolean> {
    await this.initialize();

    const filePath = this.getFilePath(key);

    try {
      const stats = await stat(filePath);
      await unlink(filePath);
      this.currentSize -= stats.size;
      logger.debug({ key, freedSize: stats.size }, 'Cache entry deleted');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      logger.error({ key, error }, 'Failed to delete cache entry');
      return false;
    }
  }

  /**
   * Checks if a cache entry exists.
   */
  async has(key: string): Promise<boolean> {
    await this.initialize();
    const filePath = this.getFilePath(key);
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
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
   * Lists all cache keys.
   */
  async keys(): Promise<string[]> {
    await this.initialize();
    const files = await readdir(this.rootDir);
    return files.filter((f) => !f.endsWith('.tmp')).map((f) => f.replace(/_/g, ':'));
  }

  /**
   * Clears all cache entries.
   */
  async clear(): Promise<void> {
    await this.initialize();
    const files = await readdir(this.rootDir);
    await Promise.all(
      files.filter((f) => !f.endsWith('.tmp')).map((f) => unlink(join(this.rootDir, f)))
    );
    this.currentSize = 0;
    logger.info('Cache cleared');
  }
}

/**
 * Creates a CacheStore instance.
 */
export function createCacheStore<T = unknown>(options: CacheStoreOptions): CacheStore<T> {
  return new CacheStore<T>(options);
}
