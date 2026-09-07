/**
 * Typed error hierarchy for Octate with exit code mapping.
 */

const errorCodes = {
  configuration: 2,
  repository: 3,
  git: 3,
  parse: 3,
  analysis: 3,
  context: 3,
  model: 4,
  providerRateLimit: 4,
  providerTimeout: 4,
  authentication: 4,
  quotaExceeded: 4,
  validation: 5,
  internal: 5,
} as const;

/**
 * Base error class for all Octate errors.
 */
export class OctateError extends Error {
  readonly exitCode: number;
  readonly context: Record<string, unknown>;

  constructor(message: string, exitCode: number, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
    this.context = context ?? {};

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON-serializable representation of the error.
   */
  toJson(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      exitCode: this.exitCode,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Configuration errors (exit code 2).
 */
export class ConfigurationError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.configuration, context);
  }
}

/**
 * Repository operation errors (exit code 3).
 */
export class RepositoryError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.repository, context);
  }
}

/**
 * Git operation errors (exit code 3).
 */
export class GitError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.git, context);
  }
}

/**
 * Parsing errors (exit code 3).
 */
export class ParseError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.parse, context);
  }
}

/**
 * Analysis errors (exit code 3).
 */
export class AnalysisError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.analysis, context);
  }
}

/**
 * Context engine errors (exit code 3).
 */
export class ContextError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.context, context);
  }
}

/**
 * Model provider errors (exit code 4).
 */
export class ModelError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.model, context);
  }
}

/**
 * Provider rate limit errors (exit code 4).
 */
export class ProviderRateLimitError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.providerRateLimit, context);
  }
}

/**
 * Provider timeout errors (exit code 4).
 */
export class ProviderTimeoutError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.providerTimeout, context);
  }
}

/**
 * Authentication errors (exit code 4).
 */
export class AuthenticationError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.authentication, context);
  }
}

/**
 * Quota exceeded errors (exit code 4).
 */
export class QuotaExceededError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.quotaExceeded, context);
  }
}

/**
 * Validation errors (exit code 5).
 */
export class ValidationError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.validation, context);
  }
}

/**
 * Internal errors (exit code 5).
 */
export class InternalError extends OctateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, errorCodes.internal, context);
  }
}

/**
 * Type guard for OctateError
 */
export function isOctateError(obj: unknown): obj is OctateError {
  return obj instanceof OctateError;
}

/**
 * Type guard for ConfigurationError
 */
export function isConfigurationError(obj: unknown): obj is ConfigurationError {
  return obj instanceof ConfigurationError;
}

/**
 * Type guard for RepositoryError
 */
export function isRepositoryError(obj: unknown): obj is RepositoryError {
  return obj instanceof RepositoryError;
}

/**
 * Type guard for GitError
 */
export function isGitError(obj: unknown): obj is GitError {
  return obj instanceof GitError;
}

/**
 * Type guard for ParseError
 */
export function isParseError(obj: unknown): obj is ParseError {
  return obj instanceof ParseError;
}

/**
 * Type guard for AnalysisError
 */
export function isAnalysisError(obj: unknown): obj is AnalysisError {
  return obj instanceof AnalysisError;
}

/**
 * Type guard for ContextError
 */
export function isContextError(obj: unknown): obj is ContextError {
  return obj instanceof ContextError;
}

/**
 * Type guard for ModelError
 */
export function isModelError(obj: unknown): obj is ModelError {
  return obj instanceof ModelError;
}

/**
 * Type guard for ProviderRateLimitError
 */
export function isProviderRateLimitError(obj: unknown): obj is ProviderRateLimitError {
  return obj instanceof ProviderRateLimitError;
}

/**
 * Type guard for ProviderTimeoutError
 */
export function isProviderTimeoutError(obj: unknown): obj is ProviderTimeoutError {
  return obj instanceof ProviderTimeoutError;
}

/**
 * Type guard for AuthenticationError
 */
export function isAuthenticationError(obj: unknown): obj is AuthenticationError {
  return obj instanceof AuthenticationError;
}

/**
 * Type guard for QuotaExceededError
 */
export function isQuotaExceededError(obj: unknown): obj is QuotaExceededError {
  return obj instanceof QuotaExceededError;
}

/**
 * Type guard for ValidationError
 */
export function isValidationError(obj: unknown): obj is ValidationError {
  return obj instanceof ValidationError;
}

/**
 * Type guard for InternalError
 */
export function isInternalError(obj: unknown): obj is InternalError {
  return obj instanceof InternalError;
}

/**
 * Factory functions for common error scenarios.
 */

export function createConfigurationError(
  message: string,
  context?: Record<string, unknown>
): ConfigurationError {
  return new ConfigurationError(message, context);
}

export function createRepositoryError(
  message: string,
  context?: Record<string, unknown>
): RepositoryError {
  return new RepositoryError(message, context);
}

export function createGitError(message: string, context?: Record<string, unknown>): GitError {
  return new GitError(message, context);
}

export function createParseError(message: string, context?: Record<string, unknown>): ParseError {
  return new ParseError(message, context);
}

export function createAnalysisError(
  message: string,
  context?: Record<string, unknown>
): AnalysisError {
  return new AnalysisError(message, context);
}

export function createContextError(
  message: string,
  context?: Record<string, unknown>
): ContextError {
  return new ContextError(message, context);
}

export function createModelError(message: string, context?: Record<string, unknown>): ModelError {
  return new ModelError(message, context);
}

export function createProviderRateLimitError(
  message: string,
  context?: Record<string, unknown>
): ProviderRateLimitError {
  return new ProviderRateLimitError(message, context);
}

export function createProviderTimeoutError(
  message: string,
  context?: Record<string, unknown>
): ProviderTimeoutError {
  return new ProviderTimeoutError(message, context);
}

export function createAuthenticationError(
  message: string,
  context?: Record<string, unknown>
): AuthenticationError {
  return new AuthenticationError(message, context);
}

export function createQuotaExceededError(
  message: string,
  context?: Record<string, unknown>
): QuotaExceededError {
  return new QuotaExceededError(message, context);
}

export function createValidationError(
  message: string,
  context?: Record<string, unknown>
): ValidationError {
  return new ValidationError(message, context);
}

export function createInternalError(
  message: string,
  context?: Record<string, unknown>
): InternalError {
  return new InternalError(message, context);
}
