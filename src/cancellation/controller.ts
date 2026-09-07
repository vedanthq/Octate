/**
 * AbortController management and propagation.
 * Single AbortController at ReviewUseCase level propagates to all layers (D-18).
 */

import { createLogger } from '../logging/index.js';

const logger = createLogger('cancellation:controller');

/**
 * CancellationController manages AbortController lifecycle and propagates
 * cancellation signals to child operations.
 */
export class CancellationController {
  private abortController: AbortController;
  private childControllers: Set<AbortController> = new Set();
  private aborted: boolean = false;
  private abortReason?: Error;

  constructor() {
    this.abortController = new AbortController();
  }

  /**
   * Gets the AbortSignal for this controller.
   * This signal should be passed to all cancellable operations.
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Checks if cancellation has been requested.
   */
  get isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Gets the abort reason if cancelled.
   */
  get reason(): Error | undefined {
    return this.abortReason;
  }

  /**
   * Creates a child AbortController that will be aborted when this controller aborts.
   * Useful for creating scoped cancellation for sub-operations.
   */
  createChildController(): AbortController {
    const child = new AbortController();
    this.childControllers.add(child);

    // If parent is already aborted, abort child immediately
    if (this.aborted) {
      child.abort(this.abortReason);
    } else {
      // Listen for parent abort
      this.abortController.signal.addEventListener(
        'abort',
        () => {
          child.abort(this.abortReason);
        },
        { once: true }
      );
    }

    // Clean up reference when child aborts
    child.signal.addEventListener(
      'abort',
      () => {
        this.childControllers.delete(child);
      },
      { once: true }
    );

    return child;
  }

  /**
   * Registers an external AbortController as a child.
   * The external controller will be aborted when this controller aborts.
   */
  registerChildController(child: AbortController): void {
    this.childControllers.add(child);

    if (this.aborted) {
      child.abort(this.abortReason);
    } else {
      this.abortController.signal.addEventListener(
        'abort',
        () => {
          child.abort(this.abortReason);
        },
        { once: true }
      );
    }

    child.signal.addEventListener(
      'abort',
      () => {
        this.childControllers.delete(child);
      },
      { once: true }
    );
  }

  /**
   * Requests cancellation of this controller and all child controllers.
   */
  abort(reason?: Error): void {
    if (this.aborted) return;

    this.aborted = true;
    this.abortReason = reason ?? new Error('Cancellation requested');
    this.abortController.abort(this.abortReason);

    // Abort all registered child controllers
    for (const child of this.childControllers) {
      child.abort(this.abortReason);
    }
    this.childControllers.clear();

    logger.info({ reason: this.abortReason?.message }, 'Cancellation requested');
  }

  /**
   * Throws if cancellation has been requested.
   * Useful for checking cancellation at await points.
   */
  throwIfAborted(): void {
    if (this.aborted) {
      throw this.abortReason ?? new Error('Operation cancelled');
    }
  }

  /**
   * Adds an event listener for the abort event.
   */
  addEventListener(
    type: 'abort',
    listener: (this: AbortSignal, ev: Event) => void,
    options?: AddEventListenerOptions
  ): void {
    this.abortController.signal.addEventListener(type, listener, options);
  }

  /**
   * Removes an event listener for the abort event.
   */
  removeEventListener(
    type: 'abort',
    listener: (this: AbortSignal, ev: Event) => void,
    options?: EventListenerOptions
  ): void {
    this.abortController.signal.removeEventListener(type, listener, options);
  }
}

/**
 * Creates a CancellationController and sets up process signal handlers.
 * Call this at the entry point of a review operation.
 */
export function createCancellationController(): CancellationController {
  const controller = new CancellationController();

  // Handle SIGINT (Ctrl+C)
  const handleSigint = () => {
    logger.info('Received SIGINT, aborting...');
    controller.abort(new Error('Interrupted by user (SIGINT)'));
  };

  // Handle SIGTERM
  const handleSigterm = () => {
    logger.info('Received SIGTERM, aborting...');
    controller.abort(new Error('Terminated (SIGTERM)'));
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  // Store cleanup function on controller for later removal
  (controller as any)._cleanup = () => {
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
  };

  return controller;
}

/**
 * Wraps an async operation with cancellation support.
 * Checks the signal before and after the operation.
 */
export async function withCancellation<T>(
  controller: CancellationController,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  controller.throwIfAborted();

  // Create a promise that rejects when aborted
  const abortPromise = new Promise<never>((_, reject) => {
    const handler = () => reject(controller.reason ?? new Error('Operation cancelled'));
    controller.signal.addEventListener('abort', handler, { once: true });

    // Clean up listener when operation completes
    const _cleanup = () => controller.signal.removeEventListener('abort', handler);
    // We can't easily clean up here since we don't know when operation completes
    // The listener has { once: true } so it self-removes on first abort
  });

  try {
    return await Promise.race([operation(controller.signal), abortPromise]);
  } finally {
    controller.throwIfAborted();
  }
}
