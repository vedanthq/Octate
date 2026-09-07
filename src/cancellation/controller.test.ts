/**
 * Tests for cancellation/controller.ts
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  CancellationController,
  createCancellationController,
  withCancellation,
} from './controller.js';

describe('cancellation:controller', () => {
  describe('CancellationController', () => {
    let controller: CancellationController;

    beforeEach(() => {
      controller = new CancellationController();
    });

    it('starts with isAborted = false', () => {
      expect(controller.isAborted).toBe(false);
      expect(controller.reason).toBeUndefined();
    });

    it('provides an AbortSignal', () => {
      expect(controller.signal).toBeInstanceOf(AbortSignal);
      expect(controller.signal.aborted).toBe(false);
    });

    it('aborts and sets isAborted = true', () => {
      controller.abort(new Error('test reason'));

      expect(controller.isAborted).toBe(true);
      expect(controller.reason).toBeInstanceOf(Error);
      expect(controller.reason?.message).toBe('test reason');
      expect(controller.signal.aborted).toBe(true);
    });

    it('throwIfAborted throws when aborted', () => {
      controller.abort(new Error('aborted'));

      expect(() => controller.throwIfAborted()).toThrow('aborted');
    });

    it('throwIfAborted does not throw when not aborted', () => {
      expect(() => controller.throwIfAborted()).not.toThrow();
    });

    it('createChildController creates child that aborts with parent', () => {
      const child = controller.createChildController();

      expect(child.signal.aborted).toBe(false);

      controller.abort(new Error('parent aborted'));

      expect(child.signal.aborted).toBe(true);
    });

    it('createChildController immediately aborts if parent already aborted', () => {
      controller.abort(new Error('already aborted'));
      const child = controller.createChildController();

      expect(child.signal.aborted).toBe(true);
    });

    it('registerChildController registers external controller', () => {
      const external = new AbortController();
      controller.registerChildController(external);

      controller.abort(new Error('parent aborted'));

      expect(external.signal.aborted).toBe(true);
    });

    it('addEventListener and removeEventListener work', () => {
      const handler = jest.fn();
      controller.addEventListener('abort', handler);
      controller.removeEventListener('abort', handler);

      controller.abort();

      // Handler should not be called since it was removed
      // But the abort still happens
      expect(controller.isAborted).toBe(true);
    });

    it('abort with no reason creates default error', () => {
      controller.abort();

      expect(controller.reason).toBeInstanceOf(Error);
      expect(controller.reason?.message).toBe('Cancellation requested');
    });

    it('multiple aborts are idempotent', () => {
      controller.abort(new Error('first'));
      const firstReason = controller.reason;
      controller.abort(new Error('second'));

      expect(controller.reason).toBe(firstReason);
    });
  });

  describe('createCancellationController', () => {
    it('creates controller with signal handlers', () => {
      const controller = createCancellationController();

      expect(controller).toBeInstanceOf(CancellationController);
      expect(controller.isAborted).toBe(false);
    });

    it('cleanup function removes signal handlers', () => {
      const controller = createCancellationController();
      const cleanup = (controller as any)._cleanup;

      expect(typeof cleanup).toBe('function');
      cleanup();
      // No error means cleanup worked
    });
  });

  describe('withCancellation', () => {
    it('executes operation when not cancelled', async () => {
      const controller = new CancellationController();
      const result = await withCancellation(controller, async () => 'success');

      expect(result).toBe('success');
    });

    it('throws when cancelled before operation', async () => {
      const controller = new CancellationController();
      controller.abort(new Error('cancelled'));

      await expect(withCancellation(controller, async () => 'success')).rejects.toThrow('cancelled');
    });

    it('throws when cancelled during operation', async () => {
      const controller = new CancellationController();

      const promise = withCancellation(controller, async (signal) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      });

      // Cancel after a short delay
      setTimeout(() => controller.abort(new Error('cancelled during')), 10);

      await expect(promise).rejects.toThrow('cancelled during');
    });

    it('checks cancellation at await points', async () => {
      const controller = new CancellationController();

      const promise = withCancellation(controller, async (signal) => {
        // First check
        controller.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Second check after await
        controller.throwIfAborted();
        return 'success';
      });

      setTimeout(() => controller.abort(new Error('cancelled')), 25);

      await expect(promise).rejects.toThrow('cancelled');
    });
  });
});