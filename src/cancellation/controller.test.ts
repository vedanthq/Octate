/**
 * Tests for CancellationController.
 */

import { describe, expect, it, jest } from '@jest/globals';
import {
  abortSignalPromise,
  CancellationController,
  createCancellationController,
  withCancellation,
} from './controller.js';

describe('CancellationController', () => {
  it('creates controller with unaborted signal', () => {
    const controller = new CancellationController();
    expect(controller.aborted).toBe(false);
    expect(controller.signal).toBeDefined();
  });

  it('aborts controller and marks signal as aborted', () => {
    const controller = new CancellationController();
    controller.abort('test reason');
    expect(controller.aborted).toBe(true);
    expect(controller.signal.reason).toBe('test reason');
  });

  it('creates child signals that abort with parent', () => {
    const controller = new CancellationController();
    const childSignal = controller.createChildSignal();

    expect(childSignal.aborted).toBe(false);

    controller.abort('parent abort');

    expect(childSignal.aborted).toBe(true);
    expect(childSignal.reason).toBe('parent abort');
  });

  it('throws on throwIfAborted when aborted', () => {
    const controller = new CancellationController();
    controller.abort('test');

    expect(() => controller.throwIfAborted()).toThrow('test');
  });

  it('does not throw when not aborted', () => {
    const controller = new CancellationController();
    expect(() => controller.throwIfAborted()).not.toThrow();
  });

  it('supports addEventListener/removeEventListener', () => {
    const controller = new CancellationController();
    const listener = jest.fn();

    controller.addEventListener('abort', listener);
    controller.abort();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createCancellationController', () => {
  it('creates controller without parent', () => {
    const controller = createCancellationController();
    expect(controller).toBeInstanceOf(CancellationController);
    expect(controller.aborted).toBe(false);
  });

  it('aborts child when parent aborts', () => {
    const parentController = new AbortController();
    const controller = createCancellationController(parentController.signal);

    expect(controller.aborted).toBe(false);

    parentController.abort('parent reason');

    expect(controller.aborted).toBe(true);
    expect(controller.signal.reason).toBe('parent reason');
  });

  it('immediately aborts if parent already aborted', () => {
    const parentController = new AbortController();
    parentController.abort('already aborted');

    const controller = createCancellationController(parentController.signal);
    expect(controller.aborted).toBe(true);
  });
});

describe('withCancellation', () => {
  it('executes operation with cancellation signal', async () => {
    const result = await withCancellation(async (signal) => {
      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);
      return 'success';
    });

    expect(result).toBe('success');
  });

  it('propagates external signal', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    const promise = withCancellation(async (signal) => {
      receivedSignal = signal;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true }
        );
      });
      return 'done';
    }, controller.signal);

    controller.abort('external');

    await expect(promise).rejects.toThrow('external');
    expect(receivedSignal!.aborted).toBe(true);
  });
});

describe('abortSignalPromise', () => {
  it('rejects when signal aborts', async () => {
    const controller = new AbortController();

    const promise = abortSignalPromise(controller.signal);

    setTimeout(() => controller.abort('test abort'), 10);

    await expect(promise).rejects.toThrow('test abort');
  });

  it('rejects immediately if already aborted', async () => {
    const controller = new AbortController();
    controller.abort('already');

    await expect(abortSignalPromise(controller.signal)).rejects.toThrow('already');
  });
});
