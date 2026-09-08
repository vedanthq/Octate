/**
 * AbortController management and propagation.
 * Single AbortController at ReviewUseCase level propagates to all layers.
 */

import type { AbortSignalLike } from '../model/types.js';

/**
 * Cancellation controller that manages AbortController lifecycle
 * and provides utilities for cancellation-aware operations.
 */
export class CancellationController {
  private abortController: AbortController;
  private childSignals: AbortSignal[] = [];

  constructor() {
    this.abortController = new AbortController();
  }

  /**
   * Gets the AbortSignal for this controller.
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Checks if cancellation has been requested.
   */
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  /**
   * Creates a child AbortSignal that aborts when this controller aborts.
   * Useful for passing to sub-operations.
   */
  createChildSignal(): AbortSignal {
    const childController = new AbortController();

    // When parent aborts, abort the child
    if (this.abortController.signal.aborted) {
      childController.abort(this.abortController.signal.reason);
    } else {
      this.abortController.signal.addEventListener('abort', () => {
        childController.abort(this.abortController.signal.reason);
      });
    }

    this.childSignals.push(childController.signal);
    return childController.signal;
  }

  /**
   * Aborts the controller and all child signals.
   */
  abort(reason?: unknown): void {
    this.abortController.abort(reason);
    for (const childSignal of this.childSignals) {
      // The child signals are aborted automatically via event listener
    }
  }

  /**
   * Throws if the signal has been aborted.
   */
  throwIfAborted(): void {
    if (this.abortController.signal.aborted) {
      throw this.abortController.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
  }

  /**
   * Adds an abort event listener.
   */
  addEventListener(type: 'abort', listener: (event: Event) => void): void {
    this.abortController.signal.addEventListener(type, listener);
  }

  /**
   * Removes an abort event listener.
   */
  removeEventListener(type: 'abort', listener: (event: Event) => void): void {
    this.abortController.signal.removeEventListener(type, listener);
  }
}

/**
 * Creates a new CancellationController with optional parent signal.
 * If parentSignal is provided, the controller will abort when the parent aborts.
 */
export function createCancellationController(parentSignal?: AbortSignal): CancellationController {
  const controller = new CancellationController();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener('abort', () => {
        controller.abort(parentSignal.reason);
      });
    }
  }

  return controller;
}

/**
 * Wraps an async operation with cancellation support.
 * The operation receives an AbortSignal and should check it periodically.
 * Races the operation against the abort signal.
 */
export async function withCancellation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const controller = createCancellationController(signal);

  try {
    // Race the operation against the abort signal
    const operationPromise = operation(controller.signal);
    const abortPromise = abortSignalPromise(controller.signal);

    const racePromise = Promise.race([operationPromise, abortPromise]);
    const result = await racePromise;
    return result;
  } finally {
    // Clean up child signals
    controller.abort();
  }
}

/**
 * Creates a promise that rejects when the signal aborts.
 * Useful for racing against cancellation.
 */
export function abortSignalPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      const reason =
        signal.reason instanceof Error
          ? signal.reason
          : new Error(String(signal.reason ?? 'Aborted'));
      reject(reason);
      return;
    }

    const handler = () => {
      const reason =
        signal.reason instanceof Error
          ? signal.reason
          : new Error(String(signal.reason ?? 'Aborted'));
      reject(reason);
    };

    signal.addEventListener('abort', handler, { once: true });
  });
}

/**
 * Checks if a signal is an AbortSignal-like object.
 */
export function isAbortSignal(signal: unknown): signal is AbortSignal {
  return (
    typeof signal === 'object' &&
    signal !== null &&
    'aborted' in signal &&
    'addEventListener' in signal &&
    'removeEventListener' in signal
  );
}
