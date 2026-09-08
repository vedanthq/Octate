/**
 * Tests for subprocess spawning with AbortSignal.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { runCommand, SubprocessError, spawnWithSignal } from './subprocess.js';

describe('spawnWithSignal', () => {
  it('spawns a simple command and returns result', async () => {
    const result = await spawnWithSignal('echo', ['hello world'], { captureOutput: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
  });

  it('captures stderr for failed commands', async () => {
    await expect(
      spawnWithSignal('ls', ['/nonexistent/path/that/does/not/exist'], { captureOutput: true })
    ).rejects.toThrow(SubprocessError);
  });

  it('respects timeout', async () => {
    // Sleep for longer than timeout
    await expect(
      spawnWithSignal('sleep', ['10'], { timeout: 100, captureOutput: true })
    ).rejects.toThrow();
  });

  it('cancels via AbortSignal', async () => {
    const controller = new AbortController();

    const promise = spawnWithSignal('sleep', ['10'], {
      signal: controller.signal,
      captureOutput: true,
    });

    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow();
  });

  it('handles invalid commands', async () => {
    await expect(
      spawnWithSignal('nonexistent-command-xyz', [], { captureOutput: true })
    ).rejects.toThrow(SubprocessError);
  });
});

describe('runCommand', () => {
  it('runs command and returns result', async () => {
    const result = await runCommand('echo', ['test']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('test');
  });

  it('throws SubprocessError on non-zero exit', async () => {
    await expect(runCommand('false', [])).rejects.toThrow(SubprocessError);
  });
});
