/**
 * Subprocess spawning with AbortSignal support.
 * Subprocesses (tsc, ruff, pytest, bandit) spawned with signal option auto-kill on abort (D-19).
 */

import { type SpawnOptions, spawn } from 'node:child_process';
import { createLogger } from '../logging/index.js';

const logger = createLogger('cancellation:subprocess');

/**
 * Error thrown when a subprocess fails.
 */
export class SubprocessError extends Error {
  readonly code: string;
  readonly signal: NodeJS.Signals | null;
  readonly exitCode: number | null;
  readonly command: string;
  readonly args: string[];

  constructor(
    message: string,
    options: {
      code: string;
      signal: NodeJS.Signals | null;
      exitCode: number | null;
      command: string;
      args: string[];
    }
  ) {
    super(message);
    this.name = 'SubprocessError';
    this.code = options.code;
    this.signal = options.signal;
    this.exitCode = options.exitCode;
    this.command = options.command;
    this.args = options.args;
  }
}

/**
 * Options for spawnWithSignal.
 */
export interface SpawnWithSignalOptions extends Omit<SpawnOptions, 'signal'> {
  /** AbortSignal to cancel the subprocess */
  signal?: AbortSignal;
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  /** Whether to kill the process tree on abort (default: true) */
  killTree?: boolean;
}

/**
 * Result of a spawned subprocess.
 */
export interface SubprocessResult {
  /** Exit code (null if killed by signal) */
  exitCode: number | null;
  /** Signal that killed the process (null if exited normally) */
  signal: NodeJS.Signals | null;
  /** Stdout as string */
  stdout: string;
  /** Stderr as string */
  stderr: string;
}

/**
 * Spawns a subprocess with AbortSignal support.
 * The subprocess will be terminated when the signal is aborted.
 */
export function spawnWithSignal(
  command: string,
  args: string[],
  options: SpawnWithSignalOptions = {}
): Promise<SubprocessResult> {
  const { signal, timeout, killTree = true, ...spawnOptions } = options;

  // Check if already aborted before spawning
  if (signal?.aborted) {
    return Promise.reject(
      new SubprocessError('Aborted before spawn', {
        code: 'ABORTED',
        signal: 'SIGABRT',
        exitCode: null,
        command,
        args,
      })
    );
  }

  return new Promise((resolve, reject) => {
    // Spawn in a new process group if killTree is true
    // This allows us to kill the entire tree without affecting the parent
    // Note: We don't pass signal to spawn; we handle abort manually for better control
    const child = spawn(command, args, {
      ...spawnOptions,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: killTree, // Create new process group for tree killing
    });

    // If detached, unref so parent can exit independently
    if (killTree && child.pid) {
      child.unref();
    }

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      child.removeAllListeners();
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    };

    const rejectOnce = (error: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(error);
      }
    };

    const resolveOnce = (result: SubprocessResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // Handle stdout
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    // Handle stderr
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle timeout
    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        logger.warn({ command, args, timeout }, 'Subprocess timed out, killing...');
        killProcessTree(child.pid!);
        rejectOnce(
          new SubprocessError(`Subprocess timed out after ${timeout}ms`, {
            code: 'TIMEOUT',
            signal: 'SIGKILL',
            exitCode: null,
            command,
            args,
          })
        );
      }, timeout);
    }

    // Handle abort signal
    const abortHandler = () => {
      logger.debug({ command, args, pid: child.pid }, 'Abort signal received, killing subprocess');
      if (killTree && child.pid) {
        killProcessTree(child.pid);
      } else {
        child.kill('SIGTERM');
      }
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    // Handle process exit
    child.on('error', (error) => {
      rejectOnce(
        new SubprocessError(`Failed to spawn subprocess: ${error.message}`, {
          code: 'SPAWN_ERROR',
          signal: null,
          exitCode: null,
          command,
          args,
        })
      );
    });

    child.on('exit', (exitCode, signalCode) => {
      if (!resolved) {
        resolveOnce({
          exitCode,
          signal: signalCode,
          stdout,
          stderr,
        });
      }
    });
  });
}

/**
 * Kills a process and its children (process tree).
 * Uses platform-specific commands for maximum effectiveness.
 */
export function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      // Windows: use taskkill /T /F
      spawn('taskkill', ['/pid', pid.toString(), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      // Unix: kill the process group (negative PID)
      // This works correctly when the child was spawned with detached: true
      process.kill(-pid, 'SIGKILL');
    }
    logger.debug({ pid }, 'Kill signal sent to process tree');
  } catch (error) {
    logger.warn({ pid, error }, 'Failed to kill process tree, trying direct kill');
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ignore
    }
  }
}
