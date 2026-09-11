/**
 * Tests for commands/review.ts
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  countBlockingFindings,
  evaluateExitCode,
  formatFailureBanner,
} from '../application/policy.js';
import { ConfigurationError } from '../errors/index.js';
import type { RankedFinding, ReviewResult } from '../review/types.js';
import {
  createReviewCommand,
  executeReview,
  getScopeOptions,
  validateOutputMode,
  validateScope,
} from './review.js';

function createMockFinding(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): RankedFinding {
  return {
    id: 'mock-id',
    title: 'Security Vulnerability',
    message: 'Detailed message',
    file: 'src/app.ts',
    startLine: 15,
    endLine: 20,
    severity,
    category: 'security',
    confidence: 0.95,
    evidence: [],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'Critical vulnerability',
    suggestedFix: 'Fix it immediately',
    reviewer: 'security',
    compositeScore: 95,
    scoreBreakdown: {
      severityScore: 100,
      confidenceScore: 95,
      evidenceStrengthScore: 90,
      blastRadiusScore: 80,
      securityImpactScore: 95,
      regressionProbabilityScore: 10,
    },
    blastRadius: 80,
    evidenceStrength: 90,
    contributingReviewers: ['security'],
  };
}

describe('commands:review', () => {
  let command: ReturnType<typeof createReviewCommand>;

  beforeEach(() => {
    command = createReviewCommand();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createReviewCommand', () => {
    it('creates command with correct name and description', () => {
      expect(command.name()).toBe('review');
      expect(command.description()).toBe('Run code review on the specified scope');
    });

    it('has all required options including --fail-on', () => {
      const options = command.options.map((o) => o.flags);
      expect(options).toContain('-s, --staged');
      expect(options).toContain('-w, --working');
      expect(options).toContain('-c, --commit <ref>');
      expect(options).toContain('-r, --range <range>');
      expect(options).toContain('--branch <branch>');
      expect(options).toContain(
        '--fail-on <severity>'
      );
      expect(options).toContain('-j, --json');
      expect(options).toContain('--sarif');
      expect(options).toContain('-q, --quiet');
      expect(options).toContain('--output <file>');
      expect(options).toContain('--no-tui');
    });

    it('accepts variadic refs argument', () => {
      const args = (command as unknown as { _args?: unknown[] })._args ?? command.args;
      expect(args.length).toBeGreaterThan(0);
    });
  });

  describe('validateScope', () => {
    it('allows invocation without scope flags (default scope)', () => {
      expect(() => validateScope({})).not.toThrow();
    });

    it('allows exactly one scope flag', () => {
      expect(() => validateScope({ staged: true })).not.toThrow();
      expect(() => validateScope({ working: true })).not.toThrow();
      expect(() => validateScope({ commit: 'abc' })).not.toThrow();
      expect(() => validateScope({ range: 'a..b' })).not.toThrow();
      expect(() => validateScope({ branch: 'feat' })).not.toThrow();
    });

    it('rejects when conflicting scope flags are specified', () => {
      expect(() => validateScope({ staged: true, working: true })).toThrow(ConfigurationError);
      expect(() => validateScope({ staged: true, commit: 'abc' })).toThrow(
        'Multiple scopes specified'
      );
      expect(() => validateScope({ working: true, range: 'a..b' })).toThrow(ConfigurationError);
    });
  });

  describe('validateOutputMode', () => {
    it('allows single output mode', () => {
      expect(() => validateOutputMode({ json: true })).not.toThrow();
      expect(() => validateOutputMode({ sarif: true })).not.toThrow();
      expect(() => validateOutputMode({ quiet: true })).not.toThrow();
      expect(() => validateOutputMode({})).not.toThrow();
    });

    it('rejects when multiple output modes specified', () => {
      expect(() => validateOutputMode({ json: true, sarif: true })).toThrow(
        'Output modes are mutually exclusive'
      );
      expect(() => validateOutputMode({ json: true, quiet: true })).toThrow(ConfigurationError);
      expect(() => validateOutputMode({ sarif: true, quiet: true })).toThrow(ConfigurationError);
    });
  });

  describe('getScopeOptions', () => {
    const repoRoot = '/test/repo';

    it('defaults to working-tree when no flags or refs are provided', () => {
      const scope = getScopeOptions({}, [], repoRoot);
      expect(scope).toEqual({ type: 'working-tree', repoRoot });
    });

    it('resolves explicit flags', () => {
      expect(getScopeOptions({ staged: true }, [], repoRoot)).toEqual({
        type: 'staged',
        repoRoot,
      });
      expect(getScopeOptions({ working: true }, [], repoRoot)).toEqual({
        type: 'working-tree',
        repoRoot,
      });
      expect(getScopeOptions({ commit: 'abc1234' }, [], repoRoot)).toEqual({
        type: 'commit',
        repoRoot,
        commit: 'abc1234',
      });
      expect(getScopeOptions({ range: 'main..HEAD' }, [], repoRoot)).toEqual({
        type: 'range',
        repoRoot,
        base: 'main',
        head: 'HEAD',
      });
      expect(getScopeOptions({ branch: 'feature-x' }, [], repoRoot)).toEqual({
        type: 'branch',
        repoRoot,
        branch: 'feature-x',
      });
    });

    it('resolves positional range ref HEAD~1..HEAD via parseRange', () => {
      const scope = getScopeOptions({}, ['HEAD~1..HEAD'], repoRoot);
      expect(scope).toEqual({
        type: 'range',
        repoRoot,
        base: 'HEAD~1',
        head: 'HEAD',
      });
    });

    it('resolves positional three-dot range ref main...HEAD', () => {
      const scope = getScopeOptions({}, ['main...HEAD'], repoRoot);
      expect(scope).toEqual({
        type: 'range',
        repoRoot,
        base: 'main',
        head: 'HEAD',
      });
    });

    it('resolves positional commit ref', () => {
      const scope = getScopeOptions({}, ['deadbeef'], repoRoot);
      expect(scope).toEqual({
        type: 'commit',
        repoRoot,
        commit: 'deadbeef',
      });
    });
  });

  describe('exit code and policy evaluation', () => {
    function createMockResult(findings: RankedFinding[]): ReviewResult {
      return {
        summary: {
          totalFindings: findings.length,
          bySeverity: {
            critical: findings.filter((f) => f.severity === 'critical').length,
            high: findings.filter((f) => f.severity === 'high').length,
            medium: findings.filter((f) => f.severity === 'medium').length,
            low: findings.filter((f) => f.severity === 'low').length,
            info: findings.filter((f) => f.severity === 'info').length,
          },
          byCategory: {
            correctness: 0,
            security: findings.length,
            performance: 0,
            architecture: 0,
            reliability: 0,
            maintainability: 0,
            compatibility: 0,
            testing: 0,
          },
          byReviewer: {},
          filesAnalyzed: 1,
          durationMs: 50,
        },
        findings,
        metadata: {
          scopeType: 'working-tree',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          model: 'test-model',
          totalTokens: 100,
          promptTokens: 50,
          completionTokens: 50,
          warnings: [],
          reviewersTriggered: ['security'],
          criticInvoked: true,
          preCriticFindingCount: findings.length,
          postCriticFindingCount: findings.length,
        },
      };
    }

    it('sets exit code 1 and produces failure banner when finding meets threshold', () => {
      const result = createMockResult([createMockFinding('critical')]);
      const exitCode = evaluateExitCode(result, 'critical');
      const count = countBlockingFindings(result.findings, 'critical');
      const banner = formatFailureBanner(count, 'critical');

      expect(exitCode).toBe(1);
      expect(count).toBe(1);
      expect(banner).toContain('Review failed');
      expect(banner).toContain('1 blocking finding');
    });

    it('returns exit code 0 in advisory mode (--fail-on none) even with critical findings', () => {
      const result = createMockResult([createMockFinding('critical')]);
      const exitCodeNone = evaluateExitCode(result, 'none');
      const exitCodeOff = evaluateExitCode(result, 'off');

      expect(exitCodeNone).toBe(0);
      expect(exitCodeOff).toBe(0);
      expect(countBlockingFindings(result.findings, 'none')).toBe(0);
    });

    it('returns exit code 0 when findings are below threshold', () => {
      const result = createMockResult([createMockFinding('medium')]);
      const exitCode = evaluateExitCode(result, 'critical');

      expect(exitCode).toBe(0);
      expect(countBlockingFindings(result.findings, 'critical')).toBe(0);
    });
  });

  describe('executeReview', () => {
    it('executes analysis and context engine pipeline on review scope', async () => {
      const scope = {
        type: 'working-tree' as const,
        base: 'HEAD',
        head: 'working-tree',
        files: [],
        diff: '',
      };
      const config = {
        version: '1.0.0',
        project: { name: 'test' },
        review: {
          severity: 'medium' as const,
          failOnSeverity: 'critical' as const,
          maxFindings: 50,
          minConfidence: 0.6,
        },
        rules: ['No bugs'],
        architecture: { boundaries: [], forbiddenDependencies: [] },
        ignore: [],
      };
      const controller = new AbortController();
      const result = await executeReview(scope, config, controller.signal, process.cwd());

      expect(result).toBeDefined();
      expect(result.summary.filesAnalyzed).toBe(0);
      expect(result.summary.totalFindings).toBe(0);
      expect(result.findings).toEqual([]);
      expect(result.metadata.scopeType).toBe('working-tree');
      expect(result.metadata.version).toBe('0.1.0');
    });
  });
});
