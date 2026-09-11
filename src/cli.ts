#!/usr/bin/env node
/**
 * Octate CLI - Terminal-native AI code review tool.
 * Entry point with Commander.js setup.
 */

import { Command } from 'commander';
import type { CancellationController } from './cancellation/index.js';
import { registerCommands } from './commands/index.js';
import { isOctateError } from './errors/index.js';
import { createLogger } from './logging/index.js';

const logger = createLogger('cli');

/**
 * Global options interface.
 */
interface GlobalOptions {
  config?: string;
  cacheDir?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'trace';
  debug?: boolean;
  version?: boolean;
  help?: boolean;
}

/**
 * Creates the main Commander.js program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('octate')
    .description('Terminal-native AI code review CLI')
    .version('0.1.0', '-v, --version', 'Display version number')
    .exitOverride()
    .hook('preAction', (thisCommand, actionCommand) => {
      // Merge global options from parent commands
      const parentOpts = thisCommand.opts();
      const childOpts = actionCommand.opts();
      Object.assign(actionCommand.opts(), { ...parentOpts, ...childOpts });
    });

  // Global options
  program
    .option('-c, --config <path>', 'Path to octate.yaml config file')
    .option('--cache-dir <path>', 'Cache directory (default: ~/.local/share/octate)')
    .option('-l, --log-level <level>', 'Log level: debug, info, warn, error, fatal, trace')
    .option('-d, --debug', 'Enable debug logging (shorthand for --log-level debug)')
    .option('--no-color', 'Disable colored output')
    .helpOption('-h, --help', 'Display help for command');

  // Register all commands
  registerCommands(program);

  return program;
}

/**
 * Sets up the logger based on global options.
 */
function _setupLogger(options: GlobalOptions): void {
  const logLevel = options.debug ? 'debug' : options.logLevel;
  if (logLevel) {
    process.env.LOG_LEVEL = logLevel;
  }
  // Recreate logger with new level
  // Note: In a real implementation, we'd update the logger instance
}

/**
 * Global exception and rejection traps to prevent unhandled crashes (D-10).
 */
export function setupProcessExceptionHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    process.stderr.write(`\nFatal Error: ${error.message}\n`);
    process.exit(5);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.fatal({ reason }, 'Unhandled rejection');
    process.stderr.write(`\nFatal Error: ${message}\n`);
    process.exit(5);
  });
}

// Install process exception traps on initialization
setupProcessExceptionHandlers();

/**
 * Handles errors and exits with appropriate code.
 */
export function handleError(error: unknown): never {
  // Handle cancellation (Ctrl+C / SIGINT)
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message.includes('cancelled') ||
      error.message.includes('Aborted'))
  ) {
    process.exit(130);
  }

  if (isOctateError(error)) {
    logger.error({ error: error.message, context: error.context }, 'Command failed');
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(error.exitCode);
  }

  // Handle Commander errors (e.g. --help or invalid flags)
  if (
    error &&
    typeof error === 'object' &&
    'exitCode' in error &&
    typeof (error as { exitCode: unknown }).exitCode === 'number'
  ) {
    process.exit((error as { exitCode: number }).exitCode);
  }

  // Handle validation errors or unexpected errors
  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, 'Unexpected error');
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(5); // Internal error
  }

  // Unknown error
  logger.error({ error: String(error) }, 'Unknown error');
  process.stderr.write(`Error: ${String(error)}\n`);
  process.exit(5);
}

/**
 * Main entry point.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const program = createProgram();

  try {
    // If no command was provided, show help
    if (!args.length) {
      program.outputHelp();
      return 0;
    }

    // Parse arguments
    await program.parseAsync(args, { from: 'user' });

    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    handleError(error);
    // TypeScript doesn't know handleError never returns
    return 5;
  }
}

/**
 * Runs a command with cancellation support.
 * Wraps the command action with AbortController propagation.
 */
export async function runWithCancellation<T>(
  controller: CancellationController,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  controller.throwIfAborted();

  const abortPromise = new Promise<never>((_, reject) => {
    const handler = () => reject(controller.signal.reason ?? new Error('Operation cancelled'));
    controller.signal.addEventListener('abort', handler, { once: true });
  });

  try {
    return await Promise.race([operation(controller.signal), abortPromise]);
  } finally {
    controller.throwIfAborted();
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    handleError(error);
  });
}
