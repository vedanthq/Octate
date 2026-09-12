/**
 * Pino logger with child logger support and secret redaction.
 */

import process from 'node:process';
import type { Logger, LoggerOptions } from 'pino';
import pino from 'pino';

const redactionPaths = [
  'NVIDIA_API_KEY',
  'apiKey',
  'token',
  'password',
  'secret',
  'authorization',
  'x-api-key',
  'apikey',
] as const;

/**
 * Determines if we're in development mode.
 */
function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Creates a Pino logger with standard configuration.
 */
function createPinoLogger(options: LoggerOptions = {}): Logger {
  const isDev = isDevelopmentMode();

  let logLevel: string;
  if (isDev) {
    logLevel = 'debug';
  } else {
    logLevel = 'info';
  }
  const envLogLevel = process.env.LOG_LEVEL;
  if (envLogLevel !== undefined) {
    logLevel = envLogLevel;
  }

  const loggerOptions: LoggerOptions = {
    level: logLevel,
    redact: {
      paths: [
        'NVIDIA_API_KEY',
        'apiKey',
        'token',
        'password',
        'secret',
        'authorization',
        'x-api-key',
        'apikey',
      ],
      censor: '[REDACTED]',
    },
    ...options,
  };

  if (isDev) {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(loggerOptions);
}

/**
 * Root logger instance.
 */
export const logger = createPinoLogger();

/**
 * Creates a child logger with module context.
 * Child loggers inherit redaction settings from the parent.
 *
 * @param name - Module or component name for context
 * @param bindings - Additional bindings to include in log output
 * @returns Child logger instance
 */
export function createLogger(name: string, bindings?: Record<string, unknown>): Logger {
  return logger.child({ module: name, ...bindings });
}

/**
 * Creates a logger with additional context for a specific operation.
 *
 * @param name - Module or component name
 * @param context - Context object to bind to all log entries
 * @returns Child logger with context
 */
export function createContextLogger(name: string, context: Record<string, unknown>): Logger {
  return logger.child({ module: name, ...context });
}

/**
 * Redaction paths used by the logger.
 * Can be extended by consumers if they have additional sensitive fields.
 */
export { redactionPaths };

/**
 * Type for the redaction paths array.
 */
export type RedactionPath = (typeof redactionPaths)[number];

/**
 * Default log levels supported.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'trace';
