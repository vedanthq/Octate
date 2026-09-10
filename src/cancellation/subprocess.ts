/**
 * Subprocess spawning with AbortSignal support.
 * Uses Node 18+ spawn with signal option for automatic cleanup on abort.
 */

import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process';
// AbortSignal is a global in Node.js 18+

/**
 * Error thrown when a subprocess fails or is killed.
 */
export class SubprocessError extends Error {
  readonly code: string | undefined;
  readonly signal: string | undefined;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    options: { code?: string; signal?: string; stdout?: string; stderr?: string } = {}
  ) {
    super(message);
    this.name = 'SubprocessError';
    this.code = options.code;
    this.signal = options.signal;
    this.stdout = options.stdout ?? '';
    this.stderr = options.stderr ?? '';
  }
}

/**
 * Extended spawn options with signal support.
 */
export interface SpawnWithSignalOptions extends SpawnOptions {
  /** AbortSignal to cancel the subprocess */
  signal?: AbortSignal;
  /** Maximum time in ms before killing the process */
  timeout?: number;
  /** Whether to collect stdout/stderr */
  captureOutput?: boolean;
}

/**
 * Result of a spawned process.
 */
export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

/**
 * Spawns a subprocess with AbortSignal support.
 * The process is automatically killed when the signal aborts.
 */
export function spawnWithSignal(
  command: string,
  args: string[],
  options: SpawnWithSignalOptions = {}
): Promise<SpawnResult> {
  const { signal, timeout, captureOutput = true, ...spawnOptions } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(command, args, {
      ...spawnOptions,
      signal,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    if (captureOutput && child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (captureOutput && child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (timeout) {
      timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);
    }

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };

    child.on('error', (error: Error) => {
      cleanup();
      reject(
        new SubprocessError(`Failed to spawn ${command}: ${error.message}`, {
          stdout,
          stderr,
        })
      );
    });

    child.on('close', (code: number | null, signal: string | null) => {
      cleanup();

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        // Check if this was due to our timeout
        if (timeout && timeoutHandle) {
          reject(
            new SubprocessError(`${command} timed out after ${timeout}ms`, {
              signal,
              stdout,
              stderr,
            })
          );
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: code,
            signal,
          });
        }
        return;
      }

      if (code !== 0) {
        reject(
          new SubprocessError(`${command} exited with code ${code}`, {
            code: code?.toString() ?? '',
            signal: signal ?? '',
            stdout,
            stderr,
          })
        );
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
      });
    });

    // Handle abort signal
    if (signal) {
      const abortHandler = () => {
        if (!child.killed) {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }
      };

      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }
  });
}

/**
 * Kills a process and its children (process tree).
 * Uses platform-specific methods for thorough cleanup.
 */
export async function killProcessTree(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    // Try to kill the process group first (Unix-like)
    if (process.platform !== 'win32') {
      process.kill(-pid, signal as NodeJS.Signals);
      return true;
    }

    // On Windows, use taskkill
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const kill = spawn('taskkill', ['/pid', pid.toString(), '/T', '/F']);
      kill.on('close', (code) => {
        resolve(code === 0);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Spawns a command and returns the child process for manual management.
 * The caller is responsible for handling the process lifecycle.
 */
export function spawnDetached(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): ChildProcess {
  return spawn(command, args, {
    ...options,
    detached: true,
    stdio: 'ignore',
  });
}

/**
 * Utility to run a command with timeout and optional cancellation.
 * Captures stdout and stderr by default.
 */
export async function runCommand(
  command: string,
  args: string[],
  options: SpawnWithSignalOptions = {}
): Promise<SpawnResult> {
  return spawnWithSignal(command, args, options);
}
