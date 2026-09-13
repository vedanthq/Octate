/**
 * Unit and integration tests for CLI entrypoint and error routing.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createProgram, handleError, main, setupProcessExceptionHandlers } from './cli.js';
import { ConfigurationError } from './errors/index.js';

describe('cli entrypoint', () => {
  let originalExit: typeof process.exit;
  let exitMock: jest.MockedFunction<(code?: number | string | null | undefined) => never>;

  beforeEach(() => {
    originalExit = process.exit;
    exitMock = jest.fn((code?: number | string | null | undefined): never => {
      throw new Error(`process.exit called with ${code}`);
    }) as unknown as jest.MockedFunction<(code?: number | string | null | undefined) => never>;
    process.exit = exitMock;
  });

  afterEach(() => {
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  describe('createProgram', () => {
    it('initializes program with name octate and registered options', () => {
      const program = createProgram();
      expect(program.name()).toBe('octate');
      expect(program.description()).toContain('Terminal-native AI code review CLI');

      const optionFlags = program.options.map((opt) => opt.flags);
      expect(optionFlags.some((f) => f.includes('--config'))).toBe(true);
      expect(optionFlags.some((f) => f.includes('--cache-dir'))).toBe(true);
      expect(optionFlags.some((f) => f.includes('--log-level'))).toBe(true);
      expect(optionFlags.some((f) => f.includes('--debug'))).toBe(true);
    });

    it('registers essential CLI commands', () => {
      const program = createProgram();
      const commandNames = program.commands.map((cmd) => cmd.name());
      expect(commandNames).toContain('doctor');
      expect(commandNames).toContain('review');
    });
  });

  describe('handleError', () => {
    it('maps AbortError to exit code 130', () => {
      const abortError = new Error('Operation was cancelled');
      abortError.name = 'AbortError';

      expect(() => handleError(abortError)).toThrow('process.exit called with 130');
      expect(exitMock).toHaveBeenCalledWith(130);
    });

    it('maps cancellation message to exit code 130', () => {
      const cancelError = new Error('Request cancelled by user');

      expect(() => handleError(cancelError)).toThrow('process.exit called with 130');
      expect(exitMock).toHaveBeenCalledWith(130);
    });

    it('maps OctateError to its exitCode', () => {
      const configError = new ConfigurationError('Invalid yaml configuration');

      expect(() => handleError(configError)).toThrow(
        `process.exit called with ${configError.exitCode}`
      );
      expect(exitMock).toHaveBeenCalledWith(configError.exitCode);
    });

    it('maps generic Error to internal error code 5', () => {
      const genericError = new Error('Unexpected crash');

      expect(() => handleError(genericError)).toThrow('process.exit called with 5');
      expect(exitMock).toHaveBeenCalledWith(5);
    });

    it('maps non-Error thrown objects to exit code 5', () => {
      expect(() => handleError('string error')).toThrow('process.exit called with 5');
      expect(exitMock).toHaveBeenCalledWith(5);
    });
  });

  describe('setupProcessExceptionHandlers', () => {
    it('attaches uncaughtException and unhandledRejection listeners', () => {
      const processOnSpy = jest.spyOn(process, 'on');
      setupProcessExceptionHandlers();

      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });

  describe('main', () => {
    it('outputs help when no arguments provided and returns 0', async () => {
      const helpSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitCode = await main([]);

      expect(exitCode).toBe(0);
      helpSpy.mockRestore();
    });
  });

  describe('CLI option parsing and collision regression tests', () => {
    it('parses review --commit HEAD correctly without config collision', () => {
      const program = createProgram();
      const reviewCmd = program.commands.find((c) => c.name() === 'review');
      reviewCmd?.action(() => {});
      program.parse(['review', '--commit', 'HEAD'], { from: 'user' });
      expect(reviewCmd?.opts().commit).toBe('HEAD');
      expect(reviewCmd?.opts().config).toBeUndefined();
    });

    it('parses review --commit HEAD~1 correctly', () => {
      const program = createProgram();
      const reviewCmd = program.commands.find((c) => c.name() === 'review');
      reviewCmd?.action(() => {});
      program.parse(['review', '--commit', 'HEAD~1'], { from: 'user' });
      expect(reviewCmd?.opts().commit).toBe('HEAD~1');
      expect(reviewCmd?.opts().config).toBeUndefined();
    });

    it('parses review --config octate.yaml correctly', () => {
      const program = createProgram();
      const reviewCmd = program.commands.find((c) => c.name() === 'review');
      reviewCmd?.action(() => {});
      program.parse(['--config', 'octate.yaml', 'review'], { from: 'user' });
      expect(reviewCmd?.opts().config).toBe('octate.yaml');
      expect(reviewCmd?.opts().commit).toBeUndefined();
    });

    it('parses review --commit HEAD --config octate.yaml correctly simultaneously', () => {
      const program = createProgram();
      const reviewCmd = program.commands.find((c) => c.name() === 'review');
      reviewCmd?.action(() => {});
      program.parse(['--config', 'octate.yaml', 'review', '--commit', 'HEAD'], { from: 'user' });
      expect(reviewCmd?.opts().commit).toBe('HEAD');
      expect(reviewCmd?.opts().config).toBe('octate.yaml');
    });
  });
});
