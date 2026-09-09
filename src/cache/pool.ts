/**
 * Bounded promise pool for concurrent operations.
 * Wrapper around p-limit with additional utilities.
 */

import pLimit from 'p-limit';

/**
 * Creates a promise pool with the given concurrency limit.
 * @param concurrency - Maximum number of concurrent operations (default: CPU cores)
 * @returns Promise pool controller
 */
export function createPromisePool(concurrency?: number): PromisePool {
  const limit = pLimit(concurrency ?? navigator?.hardwareConcurrency ?? 4);
  return new PromisePool(limit);
}

/**
 * Promise pool controller for bounded concurrency.
 */
export class PromisePool {
  private limit: ReturnType<typeof pLimit>;

  constructor(limit: ReturnType<typeof pLimit>) {
    this.limit = limit;
  }

  /**
   * Executes a function with concurrency limiting.
   * @param fn - Function to execute
   * @returns Promise that resolves with the function's result
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /**
   * Executes multiple functions with concurrency limiting.
   * @param fns - Array of functions to execute
   * @returns Promise that resolves with array of results in order
   */
  async runAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(fns.map((fn) => this.limit(fn)));
  }

  /**
   * Executes functions in batches with concurrency limiting.
   * @param items - Array of items to process
   * @param processor - Function to process each item
   * @returns Promise that resolves with array of results in order
   */
  async map<T, R>(items: T[], processor: (item: T) => Promise<R>): Promise<R[]> {
    return this.limit(() => Promise.all(items.map(processor)));
  }

  /**
   * Executes functions with a concurrency limit, collecting results as they complete.
   * @param fns - Array of functions to execute
   * @returns Async iterator yielding results as they complete
   */
  async *iterate<T>(fns: Array<() => Promise<T>>): AsyncIterableIterator<T> {
    const executing = new Set<Promise<T>>();
    const _queue = [...fns];

    for (const fn of fns) {
      const promise = this.limit(fn);
      executing.add(promise);
      promise.finally(() => executing.delete(promise));

      // Yield completed promises
      for (const p of executing) {
        try {
          const result = await p;
          yield result;
        } catch {
          // Ignore errors in iterator, they'll be caught by the caller
        }
      }
    }

    // Wait for remaining
    while (executing.size > 0) {
      const result = await Promise.race(executing);
      // Find and remove the completed promise
      for (const p of executing) {
        try {
          // Check if this promise is settled by trying to get its result
          const isSettled = await Promise.race([p, Promise.resolve(null)]);
          if (isSettled !== null) {
            executing.delete(p);
            break;
          }
        } catch {
          executing.delete(p);
          break;
        }
      }
      yield result;
    }
  }

  /**
   * Gets the number of pending (waiting) tasks.
   */
  getPendingCount(): number {
    return this.limit.pendingCount;
  }

  /**
   * Gets the number of active (running) tasks.
   */
  getActiveCount(): number {
    return this.limit.activeCount;
  }

  /**
   * Clears the pool and waits for all running tasks to complete.
   */
  async drain(): Promise<void> {
    await this.limit(() => Promise.resolve());
  }
}

/**
 * Default promise pool with CPU-core concurrency.
 */
export const defaultPool = createPromisePool();

/**
 * Creates a promise pool for a specific phase of the pipeline.
 * @param name - Phase name for logging
 * @param concurrency - Maximum concurrent operations
 */
export function createPhasePool(_name: string, concurrency?: number): PromisePool {
  return createPromisePool(concurrency);
}
