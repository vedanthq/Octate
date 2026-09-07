#!/usr/bin/env node
/**
 * Octate CLI - Terminal-native AI code review tool.
 * Entry point with Commander.js setup.
 */

import { Command } from 'commander';
import { createLogger } from './logging/index.js';
import { registerCommands } from './commands/index.js';
import { OctateError, isOctateError } from './errors/index.js';
import { loadConfig } from './config/merger.js';
import { CancellationController, createCancellationController } from './cancellation/index.js';
import { createLogger as createPinoLogger } from './logging/index.js';

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
function setupLogger(options: GlobalOptions): void {
  const logLevel = options.debug ? 'debug' : options.logLevel;
  if (logLevel) {
    process.env.LOG_LEVEL = logLevel;
  }
  // Recreate logger with new level
  // Note: In a real implementation, we'd update the logger instance
}

/**
 * Handles errors and exits with appropriate code.
 */
function handleError(error: unknown): never {
  if (isOctateError(error)) {
    logger.error({ error: error.message, context: error.context }, 'Command failed');
    // biome-ignore lint/suspicious/noConsole: CLI user output
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  // Handle validation errors from Commander.js
  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, 'Unexpected error');
    // biome-ignore lint/suspicious/noConsole: CLI user output
    console.error(`Error: ${error.message}`);
    process.exit(5); // Internal error
  }

  // Unknown error
  logger.error({ error: String(error) }, 'Unknown error');
  // biome-ignore lint/suspicious/noConsole: CLI user output
  console.error(`Error: ${String(error)}`);
  process.exit(5);
}

/**
 * Main entry point.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const program = createProgram();

  try {
    // Parse arguments
    await program.parseAsync(args, { from: 'user' });

    // If no command was provided, show help
    if (!args.length) {
      program.outputHelp();
      return 0;
    }

    return 0;
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
    const handler = () => reject(controller.reason ?? new Error('Operation cancelled'));
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