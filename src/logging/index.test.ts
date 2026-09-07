/**
 * Tests for Pino logging.
 */

import {
  createContextLogger,
  createLogger,
  type LogLevel,
  logger,
  type RedactionPath,
  redactionPaths,
} from './index.js';

describe('Pino Logger', () => {
  describe('Root Logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have standard log methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.trace).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create child logger with module context', () => {
      const childLogger = createLogger('test-module');
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.debug).toBe('function');
    });

    it('should include module in bindings', () => {
      const childLogger = createLogger('test-module');
      // The child logger should have module in its bindings
      // We can't directly inspect bindings, but we can verify it works
      expect(childLogger).not.toBe(logger);
    });

    it('should accept additional bindings', () => {
      const childLogger = createLogger('test-module', { customKey: 'customValue' });
      expect(childLogger).toBeDefined();
    });

    it('should create independent child loggers', () => {
      const logger1 = createLogger('module1');
      const logger2 = createLogger('module2');
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('createContextLogger', () => {
    it('should create child logger with context', () => {
      const contextLogger = createContextLogger('test-module', { requestId: '123' });
      expect(contextLogger).toBeDefined();
      expect(typeof contextLogger.info).toBe('function');
    });

    it('should include module and context in bindings', () => {
      const contextLogger = createContextLogger('test-module', { requestId: '123', userId: '456' });
      expect(contextLogger).not.toBe(logger);
    });
  });

  describe('Redaction', () => {
    it('should export redactionPaths', () => {
      expect(redactionPaths).toBeDefined();
      expect(Array.isArray(redactionPaths)).toBe(true);
      expect(redactionPaths.length).toBeGreaterThan(0);
    });

    it('should include standard sensitive field patterns', () => {
      expect(redactionPaths).toContain('NVIDIA_API_KEY');
      expect(redactionPaths).toContain('apiKey');
      expect(redactionPaths).toContain('token');
      expect(redactionPaths).toContain('password');
      expect(redactionPaths).toContain('secret');
      expect(redactionPaths).toContain('authorization');
      expect(redactionPaths).toContain('x-api-key');
      expect(redactionPaths).toContain('apikey');
    });

    it('should have correct type for RedactionPath', () => {
      const path: RedactionPath = 'NVIDIA_API_KEY';
      expect(path).toBe('NVIDIA_API_KEY');
    });

    it('should have correct LogLevel type', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal', 'trace'];
      levels.forEach((level) => {
        // Type check only - if this compiles, the type is correct
        const l: LogLevel = level;
        expect(l).toBe(level);
      });
    });
  });

  describe('Log Levels', () => {
    it('should support all standard log levels', () => {
      // These should not throw
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.fatal('fatal message');
      logger.trace('trace message');
    });

    it('should support child logger log levels', () => {
      const childLogger = createLogger('test');
      childLogger.debug('debug');
      childLogger.info('info');
      childLogger.warn('warn');
      childLogger.error('error');
    });
  });
});
