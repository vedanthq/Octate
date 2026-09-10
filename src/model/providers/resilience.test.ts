import { describe, expect, it, jest } from '@jest/globals';
import { AuthenticationError, ModelError, ProviderRateLimitError } from '../../errors/index.js';
import {
  calculateBackoff,
  createResilienceManager,
  type ErrorWithHttpMetadata,
  ResilienceManager,
} from './resilience.js';

describe('calculateBackoff', () => {
  it('returns ~1000ms with jitter for attempt 0', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(0);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    }
  });

  it('returns ~2000ms with jitter for attempt 1', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(1);
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    }
  });

  it('caps at 10000ms for higher attempts', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(10);
      expect(delay).toBeLessThanOrEqual(10000);
      expect(delay).toBeGreaterThanOrEqual(8000);
    }
  });
});

describe('ResilienceManager', () => {
  it('instantiates via createResilienceManager helper', () => {
    const rm = createResilienceManager({ concurrency: 1 });
    expect(rm).toBeInstanceOf(ResilienceManager);
    expect(rm.concurrency).toBe(1);
  });

  it('retries on 429 and succeeds when retry resolves', async () => {
    const rm = new ResilienceManager({
      maxRetries: 3,
      timeoutMs: 5000,
    });

    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      if (calls === 1) {
        const err: ErrorWithHttpMetadata = new Error('Too many requests');
        err.status = 429;
        err.headers = { 'retry-after': '0' };
        await Promise.resolve();
        throw err;
      }
      return 'success';
    });

    const result = await rm.execute(op);
    expect(result).toBe('success');
    expect(calls).toBe(2);
  });

  it('retries on 500 server error up to maxRetries and throws', async () => {
    const rm = new ResilienceManager({
      maxRetries: 2,
      timeoutMs: 5000,
    });

    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      const err: ErrorWithHttpMetadata = new Error('Internal Server Error');
      err.status = 500;
      err.headers = { 'retry-after': '0' };
      await Promise.resolve();
      throw err;
    });

    await expect(rm.execute(op)).rejects.toThrow(ModelError);
    // Initial call + 2 retries = 3 calls
    expect(calls).toBe(3);
  });

  it('throws ProviderRateLimitError when 429 retries are exhausted', async () => {
    const rm = new ResilienceManager({ maxRetries: 2, timeoutMs: 5000 });
    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      const err: ErrorWithHttpMetadata = new Error('Rate limit exceeded');
      err.status = 429;
      err.headers = { 'retry-after': '0' };
      await Promise.resolve();
      throw err;
    });

    await expect(rm.execute(op)).rejects.toThrow(ProviderRateLimitError);
    expect(calls).toBe(3);
  });

  it('throws AuthenticationError on 401 without retrying', async () => {
    const rm = new ResilienceManager({ maxRetries: 3 });

    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      const err: ErrorWithHttpMetadata = new Error('Unauthorized');
      err.status = 401;
      await Promise.resolve();
      throw err;
    });

    await expect(rm.execute(op)).rejects.toThrow(AuthenticationError);
    expect(calls).toBe(1);
  });

  it('respects Retry-After header duration', async () => {
    const rm = new ResilienceManager({ maxRetries: 1 });

    let calls = 0;
    const op = jest.fn(async () => {
      calls++;
      if (calls === 1) {
        const err: ErrorWithHttpMetadata = new Error('Rate limited');
        err.status = 429;
        err.headers = { 'retry-after': '0' }; // 0 seconds
        await Promise.resolve();
        throw err;
      }
      return 'ok';
    });

    const res = await rm.execute(op);
    expect(res).toBe('ok');
    expect(calls).toBe(2);
  });

  it('throttles concurrency using PromisePool', async () => {
    const rm = new ResilienceManager({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;

    const op = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      return 'done';
    };

    const results = await Promise.all([
      rm.execute(op),
      rm.execute(op),
      rm.execute(op),
      rm.execute(op),
    ]);

    expect(results).toEqual(['done', 'done', 'done', 'done']);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('aborts immediately when callerSignal is aborted', async () => {
    const rm = new ResilienceManager();
    const controller = new AbortController();

    const op = async (signal: AbortSignal) => {
      await new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted!')));
      });
      return 'never';
    };

    const promise = rm.execute(op, controller.signal);
    controller.abort(new Error('User cancelled'));

    await expect(promise).rejects.toThrow('User cancelled');
  });
});
