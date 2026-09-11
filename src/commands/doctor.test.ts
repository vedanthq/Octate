/**
 * Tests for commands/doctor.ts
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  checkNodeRuntime,
  checkNvidiaConnectivity,
  checkStaticTools,
  checkWasmGrammars,
  createDoctorCommand,
  outputDoctorResults,
  runDoctor,
} from './doctor.js';

describe('commands:doctor', () => {
  let originalExitCode: number | string | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  describe('createDoctorCommand', () => {
    it('creates command with correct name and description', () => {
      const command = createDoctorCommand();
      expect(command.name()).toBe('doctor');
      expect(command.description()).toBe(
        'Validate Octate configuration, Git access, NVIDIA connectivity, and cache health'
      );
    });

    it('has output format options', () => {
      const command = createDoctorCommand();
      const options = command.options.map((o) => o.flags);
      expect(options).toContain('--json');
      expect(options).toContain('-q, --quiet');
    });
  });

  describe('checkNodeRuntime', () => {
    it('returns pass when Node.js version is >= 22.0.0', () => {
      const result = checkNodeRuntime('v22.4.0');
      expect(result.status).toBe('pass');
      expect(result.message).toContain('>= 22.0.0');
      expect(result.remediation).toBeUndefined();
    });

    it('returns fail with remediation when Node.js version is < 22', () => {
      const result = checkNodeRuntime('v20.10.0');
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Node.js >= 22.0.0 required');
      expect(result.remediation).toContain('Upgrade Node.js to version 22 or later');
    });

    it('handles version without leading v', () => {
      const result = checkNodeRuntime('23.1.0');
      expect(result.status).toBe('pass');
    });
  });

  describe('checkStaticTools', () => {
    it('returns pass when all tools are discovered on PATH', async () => {
      const mockWhich = jest
        .fn<(cmd: string) => Promise<string | null>>()
        .mockImplementation((cmd) => Promise.resolve(`/usr/local/bin/${cmd}`));

      const result = await checkStaticTools(mockWhich);
      expect(result.status).toBe('pass');
      expect(result.details?.missing).toEqual([]);
      expect(result.remediation).toBeUndefined();
    });

    it('returns warn with remediation when tools like ruff and biome are missing', async () => {
      const mockWhich = jest
        .fn<(cmd: string) => Promise<string | null>>()
        .mockImplementation((cmd) => {
          if (cmd === 'ruff' || cmd === 'biome') return Promise.resolve(null);
          return Promise.resolve(`/usr/local/bin/${cmd}`);
        });

      const result = await checkStaticTools(mockWhich);
      expect(result.status).toBe('warn');
      expect(result.details?.missing).toContain('ruff');
      expect(result.details?.missing).toContain('biome');
      expect(result.remediation).toContain('pip install ruff');
      expect(result.remediation).toContain('@biomejs/biome');
    });
  });

  describe('checkWasmGrammars', () => {
    it('successfully validates Tree-sitter WASM grammars', async () => {
      const result = await checkWasmGrammars();
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Tree-sitter WASM grammars loaded successfully');
    });
  });

  describe('checkNvidiaConnectivity', () => {
    it('returns warn with offline mode when NVIDIA_API_KEY is not set', async () => {
      const result = await checkNvidiaConnectivity(undefined);
      expect(result.status).toBe('warn');
      expect(result.message).toContain('NVIDIA_API_KEY not set (offline review mode only)');
      expect(result.remediation).toContain('NVIDIA_API_KEY');
    });

    it('returns pass when API connects and Nemotron 3 Ultra model is verified', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'meta/llama-3-70b-instruct' }, { id: 'nvidia/nemotron-3-ultra-550b-a55b' }],
        }),
      } as unknown as Response);

      const result = await checkNvidiaConnectivity('test-key', mockFetch);
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Nemotron 3 Ultra model verified');
    });

    it('returns warn when API connects but Nemotron 3 Ultra model is absent', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'other-model' }],
        }),
      } as unknown as Response);

      const result = await checkNvidiaConnectivity('test-key', mockFetch);
      expect(result.status).toBe('warn');
      expect(result.message).toContain('nemotron-3-ultra not found in model catalog');
    });

    it('returns fail on HTTP error', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as unknown as Response);

      const result = await checkNvidiaConnectivity('test-key', mockFetch);
      expect(result.status).toBe('fail');
      expect(result.message).toContain('401');
    });

    it('returns fail on request timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const mockFetch = jest.fn<typeof fetch>().mockRejectedValue(abortError);

      const result = await checkNvidiaConnectivity('test-key', mockFetch);
      expect(result.status).toBe('fail');
      expect(result.message).toContain('timed out');
    });
  });

  describe('outputDoctorResults', () => {
    it('outputs valid JSON when --json option is enabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {
        /* suppress stdout in tests */
      });

      const sampleResult = {
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        checks: [{ name: 'Node.js Runtime', status: 'pass' as const, message: 'Node.js v22.0.0' }],
        overall: 'pass' as const,
      };

      outputDoctorResults(sampleResult, { json: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0]?.[0];
      const parsed = JSON.parse(output as string);
      expect(parsed.overall).toBe('pass');
      expect(parsed.checks).toHaveLength(1);
    });

    it('outputs concise one-line summary when --quiet option is enabled', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {
        /* suppress stdout in tests */
      });

      const sampleResult = {
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        checks: [
          { name: 'Check 1', status: 'pass' as const, message: 'ok' },
          { name: 'Check 2', status: 'warn' as const, message: 'warn' },
        ],
        overall: 'warn' as const,
      };

      outputDoctorResults(sampleResult, { quiet: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('1 passed');
      expect(output).toContain('1 warnings');
      expect(output).toContain('0 failed');
    });
  });

  describe('runDoctor integration and exit codes', () => {
    it('sets process.exitCode = 0 when overall status is pass or warn', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {
        /* suppress stdout in tests */
      });

      const result = await runDoctor({ quiet: true });
      expect(['pass', 'warn']).toContain(result.overall);
      expect(process.exitCode).toBe(0);
    });
  });
});
