/**
 * Tests for error hierarchy.
 */

import {
  AnalysisError,
  AuthenticationError,
  ConfigurationError,
  ContextError,
  createAnalysisError,
  createAuthenticationError,
  createConfigurationError,
  createContextError,
  createGitError,
  createInternalError,
  createModelError,
  createParseError,
  createProviderRateLimitError,
  createProviderTimeoutError,
  createQuotaExceededError,
  createRepositoryError,
  createValidationError,
  GitError,
  InternalError,
  isAnalysisError,
  isAuthenticationError,
  isConfigurationError,
  isContextError,
  isGitError,
  isInternalError,
  isModelError,
  isOctateError,
  isParseError,
  isProviderRateLimitError,
  isProviderTimeoutError,
  isQuotaExceededError,
  isRepositoryError,
  isValidationError,
  ModelError,
  OctateError,
  ParseError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  QuotaExceededError,
  RepositoryError,
  ValidationError,
} from './index.js';

describe('Error Hierarchy', () => {
  describe('OctateError (base class)', () => {
    it('should extend Error', () => {
      const error = new OctateError('test message', 1);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OctateError);
    });

    it('should have correct message', () => {
      const error = new OctateError('test message', 1);
      expect(error.message).toBe('test message');
    });

    it('should have exitCode property', () => {
      const error = new OctateError('test message', 42);
      expect(error.exitCode).toBe(42);
    });

    it('should have context property', () => {
      const error = new OctateError('test message', 1, { key: 'value' });
      expect(error.context).toEqual({ key: 'value' });
    });

    it('should have empty context by default', () => {
      const error = new OctateError('test message', 1);
      expect(error.context).toEqual({});
    });

    it('should have name set to constructor name', () => {
      const error = new OctateError('test message', 1);
      expect(error.name).toBe('OctateError');
    });

    it('should have stack trace', () => {
      const error = new OctateError('test message', 1);
      expect(error.stack).toBeDefined();
    });

    it('should serialize to JSON', () => {
      const error = new OctateError('test message', 1, { key: 'value' });
      const json = error.toJson();
      expect(json.name).toBe('OctateError');
      expect(json.message).toBe('test message');
      expect(json.exitCode).toBe(1);
      expect(json.context).toEqual({ key: 'value' });
      expect(json.stack).toBeDefined();
    });
  });

  describe('Exit Code Mapping', () => {
    it('ConfigurationError should have exitCode 2', () => {
      const error = new ConfigurationError('config error');
      expect(error.exitCode).toBe(2);
    });

    it('RepositoryError should have exitCode 3', () => {
      const error = new RepositoryError('repo error');
      expect(error.exitCode).toBe(3);
    });

    it('GitError should have exitCode 3', () => {
      const error = new GitError('git error');
      expect(error.exitCode).toBe(3);
    });

    it('ParseError should have exitCode 3', () => {
      const error = new ParseError('parse error');
      expect(error.exitCode).toBe(3);
    });

    it('AnalysisError should have exitCode 3', () => {
      const error = new AnalysisError('analysis error');
      expect(error.exitCode).toBe(3);
    });

    it('ContextError should have exitCode 3', () => {
      const error = new ContextError('context error');
      expect(error.exitCode).toBe(3);
    });

    it('ModelError should have exitCode 4', () => {
      const error = new ModelError('model error');
      expect(error.exitCode).toBe(4);
    });

    it('ProviderRateLimitError should have exitCode 4', () => {
      const error = new ProviderRateLimitError('rate limit');
      expect(error.exitCode).toBe(4);
    });

    it('ProviderTimeoutError should have exitCode 4', () => {
      const error = new ProviderTimeoutError('timeout');
      expect(error.exitCode).toBe(4);
    });

    it('AuthenticationError should have exitCode 4', () => {
      const error = new AuthenticationError('auth error');
      expect(error.exitCode).toBe(4);
    });

    it('QuotaExceededError should have exitCode 4', () => {
      const error = new QuotaExceededError('quota exceeded');
      expect(error.exitCode).toBe(4);
    });

    it('ValidationError should have exitCode 5', () => {
      const error = new ValidationError('validation error');
      expect(error.exitCode).toBe(5);
    });

    it('InternalError should have exitCode 5', () => {
      const error = new InternalError('internal error');
      expect(error.exitCode).toBe(5);
    });
  });

  describe('Error Context', () => {
    it('should accept context object', () => {
      const error = new ConfigurationError('config error', { file: 'config.yaml', line: 10 });
      expect(error.context).toEqual({ file: 'config.yaml', line: 10 });
    });

    it('should have human-readable message', () => {
      const error = new RepositoryError('Failed to open repository');
      expect(error.message).toBe('Failed to open repository');
    });

    it('should preserve context in JSON serialization', () => {
      const error = new GitError('git failed', { ref: 'main', statusCode: 128 });
      const json = error.toJson();
      expect(json.context).toEqual({ ref: 'main', statusCode: 128 });
    });
  });

  describe('Type Guards', () => {
    it('isOctateError should return true for OctateError instances', () => {
      expect(isOctateError(new OctateError('test', 1))).toBe(true);
      expect(isOctateError(new ConfigurationError('test'))).toBe(true);
      expect(isOctateError(new RepositoryError('test'))).toBe(true);
    });

    it('isOctateError should return false for non-OctateError', () => {
      expect(isOctateError(new Error('test'))).toBe(false);
      expect(isOctateError(null)).toBe(false);
      expect(isOctateError(undefined)).toBe(false);
      expect(isOctateError({})).toBe(false);
    });

    it('isConfigurationError should work correctly', () => {
      expect(isConfigurationError(new ConfigurationError('test'))).toBe(true);
      expect(isConfigurationError(new RepositoryError('test'))).toBe(false);
    });

    it('isRepositoryError should work correctly', () => {
      expect(isRepositoryError(new RepositoryError('test'))).toBe(true);
      expect(isRepositoryError(new GitError('test'))).toBe(false);
    });

    it('isGitError should work correctly', () => {
      expect(isGitError(new GitError('test'))).toBe(true);
      expect(isGitError(new ParseError('test'))).toBe(false);
    });

    it('isParseError should work correctly', () => {
      expect(isParseError(new ParseError('test'))).toBe(true);
      expect(isParseError(new AnalysisError('test'))).toBe(false);
    });

    it('isAnalysisError should work correctly', () => {
      expect(isAnalysisError(new AnalysisError('test'))).toBe(true);
      expect(isAnalysisError(new ContextError('test'))).toBe(false);
    });

    it('isContextError should work correctly', () => {
      expect(isContextError(new ContextError('test'))).toBe(true);
      expect(isContextError(new ModelError('test'))).toBe(false);
    });

    it('isModelError should work correctly', () => {
      expect(isModelError(new ModelError('test'))).toBe(true);
      expect(isModelError(new ProviderRateLimitError('test'))).toBe(false);
    });

    it('isProviderRateLimitError should work correctly', () => {
      expect(isProviderRateLimitError(new ProviderRateLimitError('test'))).toBe(true);
      expect(isProviderRateLimitError(new ProviderTimeoutError('test'))).toBe(false);
    });

    it('isProviderTimeoutError should work correctly', () => {
      expect(isProviderTimeoutError(new ProviderTimeoutError('test'))).toBe(true);
      expect(isProviderTimeoutError(new AuthenticationError('test'))).toBe(false);
    });

    it('isAuthenticationError should work correctly', () => {
      expect(isAuthenticationError(new AuthenticationError('test'))).toBe(true);
      expect(isAuthenticationError(new QuotaExceededError('test'))).toBe(false);
    });

    it('isQuotaExceededError should work correctly', () => {
      expect(isQuotaExceededError(new QuotaExceededError('test'))).toBe(true);
      expect(isQuotaExceededError(new ValidationError('test'))).toBe(false);
    });

    it('isValidationError should work correctly', () => {
      expect(isValidationError(new ValidationError('test'))).toBe(true);
      expect(isValidationError(new InternalError('test'))).toBe(false);
    });

    it('isInternalError should work correctly', () => {
      expect(isInternalError(new InternalError('test'))).toBe(true);
      expect(isInternalError(new ConfigurationError('test'))).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('createConfigurationError should create ConfigurationError', () => {
      const error = createConfigurationError('test', { key: 'value' });
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toBe('test');
      expect(error.context).toEqual({ key: 'value' });
    });

    it('createRepositoryError should create RepositoryError', () => {
      const error = createRepositoryError('test');
      expect(error).toBeInstanceOf(RepositoryError);
    });

    it('createGitError should create GitError', () => {
      const error = createGitError('test');
      expect(error).toBeInstanceOf(GitError);
    });

    it('createParseError should create ParseError', () => {
      const error = createParseError('test');
      expect(error).toBeInstanceOf(ParseError);
    });

    it('createAnalysisError should create AnalysisError', () => {
      const error = createAnalysisError('test');
      expect(error).toBeInstanceOf(AnalysisError);
    });

    it('createContextError should create ContextError', () => {
      const error = createContextError('test');
      expect(error).toBeInstanceOf(ContextError);
    });

    it('createModelError should create ModelError', () => {
      const error = createModelError('test');
      expect(error).toBeInstanceOf(ModelError);
    });

    it('createProviderRateLimitError should create ProviderRateLimitError', () => {
      const error = createProviderRateLimitError('test');
      expect(error).toBeInstanceOf(ProviderRateLimitError);
    });

    it('createProviderTimeoutError should create ProviderTimeoutError', () => {
      const error = createProviderTimeoutError('test');
      expect(error).toBeInstanceOf(ProviderTimeoutError);
    });

    it('createAuthenticationError should create AuthenticationError', () => {
      const error = createAuthenticationError('test');
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('createQuotaExceededError should create QuotaExceededError', () => {
      const error = createQuotaExceededError('test');
      expect(error).toBeInstanceOf(QuotaExceededError);
    });

    it('createValidationError should create ValidationError', () => {
      const error = createValidationError('test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('createInternalError should create InternalError', () => {
      const error = createInternalError('test');
      expect(error).toBeInstanceOf(InternalError);
    });
  });
});
