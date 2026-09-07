/**
 * File-based cache store with atomic writes.
 * Uses temp file + rename for atomicity.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Cache entry metadata.
 */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  size: number;
}

/**
 * Cache store options.
 */
export interface CacheStoreOptions {
  rootDir: string;
  maxSize?: number; // in bytes
}

/**
 * File-based cache store with atomic writes and size tracking.
 */
export class CacheStore {
  private rootDir: string;
  private maxSize: number;
  private currentSize: number = 0;
  private sizeInitialized: boolean = false;

  constructor(options: CacheStoreOptions) {
    this.rootDir = options.rootDir;
    this.maxSize = options.maxSize ?? 500 * 1024 * 1024; // 500MB default
  }

  /**
   * Initializes the store by calculating current size.
   */
  async initialize(): Promise<void> {
    if (this.sizeInitialized) return;

    await mkdir(this.rootDir, { recursive: true });
    this.currentSize = await this.calculateDirectorySize(this.rootDir);
    this.sizeInitialized = true;
  }

  /**
   * Calculates the total size of a directory recursively.
   */
  private async calculateDirectorySize(dir: string): Promise<number> {
    let totalSize = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch {
      // Directory doesn't exist or other error
    }
    return totalSize;
  }

  /**
   * Gets the cache entry for a key.
   */
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    await this.initialize();
    const filePath = this.keyToFilePath(key);

    try {
      const content = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry<T>;
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Sets a cache entry with atomic write.
   */
  async set<T>(key: string, value: T): Promise<void> {
    await this.initialize();

    // First serialize without size to get the content size
    const tempEntry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      size: 0,
    };
    const tempSerialized = JSON.stringify(tempEntry);
    const contentSize = Buffer.byteLength(tempSerialized, 'utf-8');

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      size: contentSize,
    };

    const serialized = JSON.stringify(entry);

    // Check if we need to evict before writing
    await this.ensureSpace(entry.size);

    const filePath = this.keyToFilePath(key);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Atomic write: write to temp file, then rename
    const tempPath = `${filePath}.tmp.${createHash('sha256')
      .update(key + Date.now().toString())
      .digest('hex')
      .substring(0, 8)}`;

    try {
      await writeFile(tempPath, serialized, 'utf-8');
      await rename(tempPath, filePath);
      this.currentSize += entry.size;
    } catch (error) {
      // Clean up temp file on error
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Deletes a cache entry.
   */
  async delete(key: string): Promise<boolean> {
    await this.initialize();
    const filePath = this.keyToFilePath(key);

    try {
      const stats = await stat(filePath);
      await unlink(filePath);
      this.currentSize -= stats.size;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a key exists in the cache.
   */
  async has(key: string): Promise<boolean> {
    await this.initialize();
    const filePath = this.keyToFilePath(key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the current cache size in bytes.
   */
  async getSize(): Promise<number> {
    await this.initialize();
    return this.currentSize;
  }

  /**
   * Gets the maximum cache size in bytes.
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Clears all cache entries.
   */
  async clear(): Promise<void> {
    await this.initialize();
    await this.clearDirectory(this.rootDir);
    this.currentSize = 0;
  }

  /**
   * Recursively clears a directory.
   */
  private async clearDirectory(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          await this.clearDirectory(fullPath);
          try {
            await rmdir(fullPath);
          } catch {
            // Ignore errors removing empty directories
          }
        } else if (entry.isFile()) {
          await unlink(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Ensures there's enough space for a new entry.
   * Evicts LRU entries if necessary.
   */
  private async ensureSpace(requiredSize: number): Promise<void> {
    if (this.currentSize + requiredSize <= this.maxSize) {
      return;
    }

    // Collect all entries with their creation times (including subdirectories)
    const entries: Array<{ path: string; createdAt: number; size: number }> = [];

    await this.collectEntries(this.rootDir, entries);

    // Sort by creation time (oldest first)
    entries.sort((a, b) => a.createdAt - b.createdAt);

    // Evict oldest entries until we have enough space
    for (const entry of entries) {
      if (this.currentSize + requiredSize <= this.maxSize) {
        break;
      }
      await unlink(entry.path);
      this.currentSize -= entry.size;
    }
  }

  /**
   * Recursively collects all cache entries from a directory.
   */
  private async collectEntries(
    dir: string,
    entries: Array<{ path: string; createdAt: number; size: number }>
  ): Promise<void> {
    try {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = resolve(dir, file.name);
        if (file.isDirectory()) {
          await this.collectEntries(filePath, entries);
        } else if (file.isFile()) {
          try {
            const stats = await stat(filePath);
            const content = await readFile(filePath, 'utf-8');
            const entry = JSON.parse(content) as CacheEntry;
            entries.push({
              path: filePath,
              createdAt: entry.createdAt,
              size: stats.size,
            });
          } catch {
            // Skip invalid entries
          }
        }
      }
    } catch {
      // No files to evict
    }
  }

  /**
   * Converts a cache key to a file path.
   * Uses subdirectories based on key prefix for better filesystem performance.
   */
  private keyToFilePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    const prefix = hash.substring(0, 2);
    return resolve(this.rootDir, prefix, hash);
  }
}

/**
 * Creates a cache store with the given options.
 */
export async function createCacheStore(options: CacheStoreOptions): Promise<CacheStore> {
  const store = new CacheStore(options);
  await store.initialize();
  return store;
}

// Re-export access for internal use
import { access } from 'node:fs/promises';
