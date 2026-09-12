/**
 * Phase 8 & 9: Model Resilience, Subprocess Lifecycle, CLI & Presentation Stress Tests.
 *
 * Validates:
 * - ResilienceManager exponential backoff with jitter, Retry-After header parsing, and retry limits.
 * - HTTP 429 rate limits, HTTP 500/502 server errors, and 401/403 non-retryable authentication failures.
 * - Per-request timeout (ProviderTimeoutError) and AbortSignal propagation during backoff sleeps.
 * - LocalNvidiaProvider schema repair loop hard-stopping at maxRepairTurns = 2.
 * - spawnWithSignal subprocess timeout, SIGTERM/SIGKILL escalation, and AbortSignal lifecycle cleanup.
 * - CLI mutual exclusion validation for Git scopes and output formats.
 * - TUI fallback matrix (non-TTY, CI, dumb terminal, automation flags).
 * - SARIF v2.1.0 schema compliance and OASIS level mappings.
 * - ConsoleRenderer badge formatting and stream output resilience.
 */

import { Writable } from 'node:stream';
import { describe, expect, it } from '@jest/globals';
import { SubprocessError, spawnWithSignal } from '../../src/cancellation/subprocess.js';
import { validateOutputMode, validateScope } from '../../src/commands/review.js';
import {
  AuthenticationError,
  ConfigurationError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ValidationError,
} from '../../src/errors/index.js';
import { LocalNvidiaProvider } from '../../src/model/providers/nvidia.js';
import { calculateBackoff, ResilienceManager } from '../../src/model/providers/resilience.js';
import { ConsoleRenderer, formatBadge } from '../../src/renderers/console.js';
import { SarifRenderer, severityToSarifLevel } from '../../src/renderers/sarif.js';
import { shouldUseTui } from '../../src/renderers/tui/terminal.js';
import { writeRenderedOutput } from '../../src/renderers/types.js';
import { createTestFinding } from '../../src/review/__tests__/mocks.js';
import type { ReviewResult } from '../../src/review/types.js';

describe('Phase 8: Model Resilience & Subprocess Stress Tests', () => {
  describe('ResilienceManager Backoff & HTTP Handling', () => {
    it('calculates exponential backoff with ±20% jitter clamped to maxMs', () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const backoff = calculateBackoff(attempt, 100, 1000);
        expect(backoff).toBeGreaterThanOrEqual(0);
        expect(backoff).toBeLessThanOrEqual(1000);
      }
    });

    it('retries on HTTP 429 and respects Retry-After headers', async () => {
      const mgr = new ResilienceManager({ maxRetries: 3, timeoutMs: 2000 });
      let callCount = 0;

      const result = await mgr.execute(async () => {
        callCount++;
        if (callCount < 3) {
          const err: Error & { status?: number; headers?: Record<string, string> } = new Error(
            'Rate limited'
          );
          err.status = 429;
          err.headers = { 'retry-after': '0' }; // Immediate retry for test speed
          throw err;
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });

    it('throws ProviderRateLimitError when HTTP 429 exceeds maxRetries', async () => {
      const mgr = new ResilienceManager({ maxRetries: 2, timeoutMs: 2000 });
      let callCount = 0;

      await expect(
        mgr.execute(async () => {
          callCount++;
          const err: Error & { status?: number; headers?: Record<string, string> } = new Error(
            'Rate limited'
          );
          err.status = 429;
          err.headers = { 'retry-after': '0' };
          throw err;
        })
      ).rejects.toThrow(ProviderRateLimitError);

      expect(callCount).toBe(3); // Attempt 0, 1, 2
    });

    it('retries on HTTP 500/502 and recovers after transient server failures', async () => {
      const mgr = new ResilienceManager({ maxRetries: 3, timeoutMs: 2000 });
      let callCount = 0;

      const result = await mgr.execute(async () => {
        callCount++;
        if (callCount === 1) {
          const err: Error & { status?: number } = new Error('Internal Server Error');
          err.status = 500;
          throw err;
        }
        if (callCount === 2) {
          const err: Error & { status?: number } = new Error('Bad Gateway');
          err.status = 502;
          throw err;
        }
        return 'recovered';
      });

      expect(result).toBe('recovered');
      expect(callCount).toBe(3);
    });

    it('fails fast on HTTP 401/403 AuthenticationError without any retries', async () => {
      const mgr = new ResilienceManager({ maxRetries: 3, timeoutMs: 2000 });
      let callCount = 0;

      await expect(
        mgr.execute(async () => {
          callCount++;
          const err: Error & { status?: number } = new Error('Unauthorized');
          err.status = 401;
          throw err;
        })
      ).rejects.toThrow(AuthenticationError);

      expect(callCount).toBe(1); // No retries for auth
    });

    it('enforces request timeout and throws ProviderTimeoutError', async () => {
      const mgr = new ResilienceManager({ maxRetries: 1, timeoutMs: 50 });

      await expect(
        mgr.execute(async (signal) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(signal.reason);
            });
          });
        })
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it('cancels immediately during backoff sleep when caller signal is aborted', async () => {
      const mgr = new ResilienceManager({ maxRetries: 3, timeoutMs: 5000 });
      const controller = new AbortController();

      let callCount = 0;
      const promise = mgr.execute(async () => {
        callCount++;
        const err: Error & { status?: number } = new Error('Server error');
        err.status = 503;
        // Trigger abort right before sleep
        setTimeout(() => controller.abort(), 10);
        throw err;
      }, controller.signal);

      await expect(promise).rejects.toThrow();
      expect(callCount).toBe(1);
    });
  });

  describe('LocalNvidiaProvider Schema Repair Loop Stress', () => {
    it('stops and throws ValidationError after exactly 2 repair attempts on invalid JSON', async () => {
      let callCount = 0;

      // Mock fetch returning unparseable text
      const originalFetch = global.fetch;
      global.fetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '<<<THIS IS NOT JSON>>>' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        const provider = new LocalNvidiaProvider({
          apiKey: 'nvapi-test-fake-key',
          maxRetries: 0,
        });

        await expect(
          provider.generate({
            systemPolicy: 'policy',
            reviewTask: 'structural review',
            diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
            context: [],
            diagnostics: [],
          })
        ).rejects.toThrow(ValidationError);

        // Turn 0 (initial) + Turn 1 (repair 1) + Turn 2 (repair 2) = 3 total attempts
        expect(callCount).toBe(3);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('stops and throws ValidationError after 2 repair attempts on schema non-conformance', async () => {
      let callCount = 0;

      const originalFetch = global.fetch;
      // Valid JSON but completely missing required 'findings' array
      global.fetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: JSON.stringify({ wrongField: 123 }) } },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        const provider = new LocalNvidiaProvider({
          apiKey: 'nvapi-test-fake-key',
          maxRetries: 0,
        });

        await expect(
          provider.generate({
            systemPolicy: 'policy',
            reviewTask: 'structural review',
            diff: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
            context: [],
            diagnostics: [],
          })
        ).rejects.toThrow(ValidationError);

        expect(callCount).toBe(3);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Subprocess Lifecycle & Timeout Killing', () => {
    it('executes a standard command with spawnWithSignal successfully', async () => {
      const result = await spawnWithSignal('node', ['-e', 'console.log("octate-subprocess-ok")']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('octate-subprocess-ok');
    });

    it('kills hanging subprocess on timeout and throws SubprocessError', async () => {
      // Node command that sleeps for 5 seconds
      const t0 = performance.now();
      await expect(
        spawnWithSignal('node', ['-e', 'setTimeout(() => {}, 5000)'], {
          timeout: 100, // Terminate after 100ms
        })
      ).rejects.toThrow(SubprocessError);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1000); // Terminated promptly, not waiting 5s
    });

    it('kills subprocess immediately when AbortSignal triggers', async () => {
      const controller = new AbortController();
      const t0 = performance.now();

      setTimeout(() => controller.abort(), 50);

      await expect(
        spawnWithSignal('node', ['-e', 'setTimeout(() => {}, 5000)'], {
          signal: controller.signal,
        })
      ).rejects.toThrow();
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1000);
    });

    it('handles nonexistent binary command cleanly with SubprocessError', async () => {
      await expect(
        spawnWithSignal('nonexistent_octate_binary_12345', ['--version'])
      ).rejects.toThrow(SubprocessError);
    });
  });
});

describe('Phase 9: CLI Option Validation, TUI & Presentation Stress Tests', () => {
  describe('CLI Option Mutually Exclusive Constraints', () => {
    it('rejects conflicting Git scopes with ConfigurationError', () => {
      expect(() => validateScope({ staged: true, working: true })).toThrow(ConfigurationError);
      expect(() => validateScope({ commit: 'abc', branch: 'main' })).toThrow(ConfigurationError);
      expect(() => validateScope({ range: 'base..head', staged: true })).toThrow(
        ConfigurationError
      );
      expect(() => validateScope({ working: true })).not.toThrow();
      expect(() => validateScope({ staged: true })).not.toThrow();
    });

    it('rejects conflicting output modes with ConfigurationError', () => {
      expect(() => validateOutputMode({ json: true, sarif: true })).toThrow(ConfigurationError);
      expect(() => validateOutputMode({ sarif: true, quiet: true })).toThrow(ConfigurationError);
      expect(() => validateOutputMode({ json: true, quiet: true })).toThrow(ConfigurationError);
      expect(() => validateOutputMode({ json: true })).not.toThrow();
      expect(() => validateOutputMode({ sarif: true })).not.toThrow();
      expect(() => validateOutputMode({ quiet: true })).not.toThrow();
    });
  });

  describe('TUI Fallback Matrix (shouldUseTui)', () => {
    it('disables TUI in non-interactive, CI, or dumb terminal environments', () => {
      expect(shouldUseTui({ isTTY: false })).toBe(false);
      expect(shouldUseTui({ isTTY: true, ci: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, term: 'dumb' })).toBe(false);
      expect(shouldUseTui({ isTTY: true, plain: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, noTui: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, json: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, sarif: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, quiet: true })).toBe(false);
      expect(shouldUseTui({ isTTY: true, outputFile: '/tmp/out.json' })).toBe(false);
      expect(shouldUseTui({ isTTY: true, ci: false, term: 'xterm-256color' })).toBe(true);
    });
  });

  describe('SARIF v2.1.0 OASIS Schema Compliance', () => {
    it('maps Octate severity to SARIF levels correctly', () => {
      expect(severityToSarifLevel('critical')).toBe('error');
      expect(severityToSarifLevel('high')).toBe('error');
      expect(severityToSarifLevel('medium')).toBe('warning');
      expect(severityToSarifLevel('low')).toBe('note');
      expect(severityToSarifLevel('info')).toBe('note');
    });

    it('renders OASIS SARIF v2.1.0 compliant output', async () => {
      let emittedData = '';
      const customStream = new Writable({
        write(chunk, _encoding, callback) {
          emittedData += chunk.toString();
          callback();
        },
      });

      const mockResult: ReviewResult = {
        summary: {
          totalFindings: 2,
          bySeverity: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
          byCategory: {
            correctness: 1,
            security: 1,
            performance: 0,
            architecture: 0,
            reliability: 0,
            maintainability: 0,
            compatibility: 0,
            testing: 0,
          },
          byReviewer: { structural: 1, security: 1 },
          filesAnalyzed: 2,
          durationMs: 120,
        },
        findings: [
          createTestFinding({
            severity: 'critical',
            category: 'security',
            title: 'SQL Injection in Query',
            message: 'Unsanitized input in query',
            file: 'src/db.ts',
            startLine: 45,
          }),
          createTestFinding({
            severity: 'medium',
            category: 'correctness',
            title: 'Nullable dereference',
            message: 'Object might be null',
            file: 'src/app.ts',
            startLine: 12,
          }),
        ],
        metadata: {
          scopeType: 'working-tree',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          model: 'nemotron',
          totalTokens: 150,
          promptTokens: 100,
          completionTokens: 50,
          warnings: [],
          reviewersTriggered: ['structural', 'security'],
          criticInvoked: true,
          preCriticFindingCount: 2,
          postCriticFindingCount: 2,
        },
      };

      const renderer = new SarifRenderer({ stream: customStream });
      await renderer.render(mockResult);

      expect(emittedData.length).toBeGreaterThan(0);
      const parsed = JSON.parse(emittedData);

      expect(parsed.version).toBe('2.1.0');
      expect(parsed.$schema).toContain('sarif');
      expect(parsed.runs).toHaveLength(1);
      expect(parsed.runs[0]?.tool?.driver?.name).toBe('Octate');
      expect(parsed.runs[0]?.results).toHaveLength(2);
      expect(parsed.runs[0]?.results[0]?.level).toBe('error'); // critical -> error
      expect(parsed.runs[0]?.results[1]?.level).toBe('warning'); // medium -> warning
    });
  });

  describe('ConsoleRenderer & Stream Output Resilience', () => {
    it('formats badges for all severity levels without throwing', () => {
      const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
      for (const sev of severities) {
        const badge = formatBadge(sev);
        expect(typeof badge).toBe('string');
        expect(badge.length).toBeGreaterThan(0);
      }
    });

    it('writes output to custom writable stream and ensures trailing newline', async () => {
      let output = '';
      const stream = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      await writeRenderedOutput('Test line without newline', { stream });
      expect(output.endsWith('\n')).toBe(true);
    });

    it('renders clean console summary when findings is empty', async () => {
      let output = '';
      const stream = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      const emptyResult: ReviewResult = {
        summary: {
          totalFindings: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          byCategory: {
            correctness: 0,
            security: 0,
            performance: 0,
            architecture: 0,
            reliability: 0,
            maintainability: 0,
            compatibility: 0,
            testing: 0,
          },
          byReviewer: {},
          filesAnalyzed: 3,
          durationMs: 40,
        },
        findings: [],
        metadata: {
          scopeType: 'working-tree',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          model: 'nemotron',
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          warnings: [],
          reviewersTriggered: [],
          criticInvoked: false,
          preCriticFindingCount: 0,
          postCriticFindingCount: 0,
        },
      };

      const renderer = new ConsoleRenderer({ stream });
      await renderer.render(emptyResult);

      expect(output).toContain('No issues found');
      expect(output).toContain('Files analyzed: 3');
    });
  });
});
