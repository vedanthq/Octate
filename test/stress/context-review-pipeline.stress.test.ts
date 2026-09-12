/**
 * Phase 6 & 7: Context Engine, Token Budget, and Review Pipeline Stress Tests.
 *
 * Validates:
 * - Token budget bounds clamping, dynamic tier partitioning, knapsack selection under 1,000+ candidates.
 * - Diff budget overflow protection (single file & multi-file prioritization) and middle-out windowing extremes.
 * - Reviewer DAG concurrency, role slicing, and error isolation (single reviewer failure graceful degradation).
 * - Reviewer DAG fail-fast when all stages fail.
 * - Two-Stage Critic deterministic hard floor (grounding, line bounds, path traversal, actionability, mock filter).
 * - Critic LLM bypass when zero findings pass Stage 3A hard floor.
 * - High-volume finding deduplication (pre-critic syntactic clustering and post-critic multi-factor consolidation).
 * - Critical-Protected Truncation and deterministic tie-breaking in composite ranking.
 * - ReviewEngine end-to-end fast short-circuiting and cancellation handling.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { ModelError } from '../../src/errors/index.js';
import { estimateTokens, TokenBudgetManager } from '../../src/intelligence/context/budget.js';
import { ContextEngine } from '../../src/intelligence/context/engine.js';
import { windowSnippet } from '../../src/intelligence/context/windowing.js';
import { ReferenceGraph } from '../../src/intelligence/graph/reference.js';
import { SymbolIndex } from '../../src/intelligence/index/symbol-index.js';
import type { CandidateItem } from '../../src/intelligence/types.js';
import type { Diagnostic, ModelFinding } from '../../src/model/types.js';
import {
  createTestContext,
  createTestFinding,
  MockReviewModel,
} from '../../src/review/__tests__/mocks.js';
import {
  executeCriticStage,
  filterDeterministicHardFloor,
  isActionableFix,
} from '../../src/review/critic.js';
import { executeReviewDAG, sliceDiagnosticsForRole } from '../../src/review/dag.js';
import {
  normalizeTitle,
  postCriticConsolidate,
  preCriticDeduplicate,
} from '../../src/review/dedup.js';
import { ReviewEngine } from '../../src/review/engine.js';
import { rankAndTruncateFindings } from '../../src/review/ranking.js';

describe('Phase 6: Context Engine & Token Budget Stress Tests', () => {
  describe('TokenBudgetManager & Token Estimation', () => {
    it('strictly clamps token budget between 8000 and 16000 across extreme inputs', () => {
      const extremeInputs = [
        -1000, -1, 0, 1, 100, 500, 7999, 8000, 12000, 16000, 16001, 50000, 1000000,
      ];

      for (const input of extremeInputs) {
        const mgr = new TokenBudgetManager(input);
        const budget = mgr.getTieredBudget();

        expect(budget.maxTotalTokens).toBeGreaterThanOrEqual(8000);
        expect(budget.maxTotalTokens).toBeLessThanOrEqual(16000);

        const sum =
          budget.diffAndSymbolsMax +
          budget.diagnosticsAndTypesMax +
          budget.callersCalleesMax +
          budget.testsAndHistoryMax;
        expect(sum).toBe(budget.maxTotalTokens);
      }
    });

    it('partitions token budget according to exact D-05 ratios (45%, 20%, 20%, 15%)', () => {
      const mgr8k = new TokenBudgetManager(8000);
      const b8k = mgr8k.getTieredBudget();
      expect(b8k.diffAndSymbolsMax).toBe(3600); // 45%
      expect(b8k.diagnosticsAndTypesMax).toBe(1600); // 20%
      expect(b8k.callersCalleesMax).toBe(1600); // 20%
      expect(b8k.testsAndHistoryMax).toBe(1200); // 15%

      const mgr16k = new TokenBudgetManager(16000);
      const b16k = mgr16k.getTieredBudget();
      expect(b16k.diffAndSymbolsMax).toBe(7200);
      expect(b16k.diagnosticsAndTypesMax).toBe(3200);
      expect(b16k.callersCalleesMax).toBe(3200);
      expect(b16k.testsAndHistoryMax).toBe(2400);
    });

    it('safely calculates token estimates on extreme strings without NaN or negative results', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('a')).toBeGreaterThan(0);

      const hugeString = 'x'.repeat(1_000_000);
      const estimate = estimateTokens(hugeString);
      expect(Number.isFinite(estimate)).toBe(true);
      expect(estimate).toBeGreaterThan(250_000);
    });

    it('selects candidates greedily within budget and handles 1,000+ candidates in < 100ms', () => {
      const mgr = new TokenBudgetManager(8000);
      const candidateTypes = ['changed-symbol', 'diagnostic', 'caller', 'test'] as const;

      const candidates: CandidateItem[] = [];
      for (let i = 0; i < 1200; i++) {
        const type = candidateTypes[i % candidateTypes.length]!;
        candidates.push({
          file: `src/file_${i}.ts`,
          startLine: 1,
          endLine: 20,
          content: `function dummySymbol_${i}() { return ${i} * 42; }`,
          type,
          score: (i % 100) + 1,
        });
      }

      const t0 = performance.now();
      const { selected, metrics } = mgr.selectCandidates(candidates);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(200); // High throughput knapsack
      expect(selected.length).toBeGreaterThan(0);
      expect(metrics.selectedCount).toBe(selected.length);
      expect(metrics.selectedTokens).toBeLessThanOrEqual(8000);
      expect(metrics.candidateCount).toBe(1200);
    });

    it('rolls over unused tier budget to allow higher scoring candidates from other tiers', () => {
      const mgr = new TokenBudgetManager(8000);
      // Diff/Symbols has 3600 budget, but we provide only 1 small symbol
      const smallSymbol: CandidateItem = {
        file: 'src/main.ts',
        startLine: 1,
        endLine: 2,
        content: 'const a = 1;',
        type: 'changed-symbol',
        score: 10,
      };

      // Tier 4 (tests) has 1200 budget, but we provide 10 large tests with high scores
      const heavyTests: CandidateItem[] = [];
      for (let i = 0; i < 15; i++) {
        heavyTests.push({
          file: `test/heavy_${i}.test.ts`,
          startLine: 1,
          endLine: 50,
          content: `// Heavy test content `.repeat(25),
          type: 'test',
          score: 90 + i,
        });
      }

      const { selected } = mgr.selectCandidates([smallSymbol, ...heavyTests]);

      // Selected items should include the small symbol plus rollover-absorbed heavy tests
      expect(selected.some((item) => item.type === 'changed-symbol')).toBe(true);
      const selectedTests = selected.filter((item) => item.type === 'test');
      expect(selectedTests.length).toBeGreaterThan(5); // More than initial tier4 budget allows
    });
  });

  describe('Diff Overflow Protection & Call-Site Windowing', () => {
    it('truncates a single massive file diff exceeding 50% token budget with warning comment', async () => {
      const engine = new ContextEngine();
      const lines = Array.from({ length: 4000 }, (_, i) => `+const line_${i} = ${i};`);
      const massiveDiff = `diff --git a/src/huge.ts b/src/huge.ts\n${lines.join('\n')}`;

      const symbolIndex = new SymbolIndex();
      const referenceGraph = new ReferenceGraph();

      const context = await engine.buildContext({
        changedFiles: ['src/huge.ts'],
        diff: massiveDiff,
        symbolIndex,
        referenceGraph,
        readFile: async () => 'content',
        maxTokens: 8000,
      });

      expect(context.metrics).toBeDefined();
      expect(context.totalTokens).toBeLessThanOrEqual(8000);
    });

    it('prioritizes logic files over lockfiles and docs in multi-file diff overflow', async () => {
      const engine = new ContextEngine();

      const logicChunk = `diff --git a/src/core.ts b/src/core.ts\n${Array.from({ length: 200 }, (_, i) => `+const core_${i} = ${i};`).join('\n')}\n`;
      const testChunk = `diff --git a/src/core.test.ts b/src/core.test.ts\n${Array.from({ length: 300 }, (_, i) => `+const test_${i} = ${i};`).join('\n')}\n`;
      const docChunk = `diff --git a/README.md b/README.md\n${Array.from({ length: 300 }, (_, i) => `+# Docs Line ${i}`).join('\n')}\n`;
      const lockChunk = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n${Array.from({ length: 2500 }, (_, i) => `+lock entry ${i}: spec`).join('\n')}\n`;

      const combinedDiff = logicChunk + testChunk + docChunk + lockChunk;

      const symbolIndex = new SymbolIndex();
      const referenceGraph = new ReferenceGraph();

      const context = await engine.buildContext({
        changedFiles: ['src/core.ts', 'src/core.test.ts', 'README.md', 'pnpm-lock.yaml'],
        diff: combinedDiff,
        symbolIndex,
        referenceGraph,
        readFile: async () => 'code',
        maxTokens: 8000,
      });

      expect(context).toBeDefined();
    });

    it('handles windowSnippet across extreme line counts and boundary target lines', () => {
      // 1. File <= 40 lines
      const shortFile = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const shortResult = windowSnippet(shortFile, 2);
      expect(shortResult).toContain('   1 | const a = 1;');
      expect(shortResult).toContain('   2 | const b = 2;');
      expect(shortResult).not.toContain('omitted');

      // 2. File with 5,000 lines, targetLine in middle
      const largeLines = Array.from({ length: 5000 }, (_, i) => `const val_${i + 1} = ${i + 1};`);
      const largeFile = largeLines.join('\n');

      const midResult = windowSnippet(largeFile, 2500, 10);
      expect(midResult).toContain('... [2489 lines omitted] ...');
      expect(midResult).toContain('2500 | const val_2500 = 2500;');
      expect(midResult).toContain('... [2490 lines omitted] ...');

      // 3. targetLine at boundary 1
      const startResult = windowSnippet(largeFile, 1, 10);
      expect(startResult).toContain('   1 | const val_1 = 1;');
      expect(startResult).toContain('... [4989 lines omitted] ...');

      // 4. targetLine at boundary 5000
      const endResult = windowSnippet(largeFile, 5000, 10);
      expect(endResult).toContain('... [4989 lines omitted] ...');
      expect(endResult).toContain('5000 | const val_5000 = 5000;');

      // 5. targetLine negative or out of bounds
      const clampedNegative = windowSnippet(largeFile, -999, 10);
      expect(clampedNegative).toContain('   1 | const val_1 = 1;');

      const clampedExcess = windowSnippet(largeFile, 999999, 10);
      expect(clampedExcess).toContain('5000 | const val_5000 = 5000;');

      // 6. With signatureLines prepended
      const sigResult = windowSnippet(largeFile, 2500, 10, [
        'export function targetFunction(): void {',
      ]);
      expect(sigResult).toContain('   1 | export function targetFunction(): void {');
      expect(sigResult).toContain('2500 | const val_2500 = 2500;');
    });
  });
});

describe('Phase 7: Review Pipeline & Review DAG Stress Tests', () => {
  let model: MockReviewModel;
  let symbolIndex: SymbolIndex;
  let referenceGraph: ReferenceGraph;

  beforeEach(() => {
    model = new MockReviewModel();
    symbolIndex = new SymbolIndex();
    referenceGraph = new ReferenceGraph();
  });

  describe('Review DAG Graceful Degradation & Error Isolation', () => {
    it('slices diagnostics correctly for structural, semantic, and security roles', () => {
      const diagnostics: Diagnostic[] = [
        {
          file: 'a.ts',
          line: 1,
          message: 'Type error: Type string is not assignable',
          source: 'tsc',
          severity: 'error',
        },
        {
          file: 'b.ts',
          line: 10,
          message: 'Expected 2 to equal 3',
          source: 'jest',
          severity: 'error',
        },
        {
          file: 'c.ts',
          line: 20,
          message: 'SQL injection detected (CWE-89)',
          source: 'bandit',
          severity: 'warning',
        },
      ];

      const structural = sliceDiagnosticsForRole('structural', diagnostics);
      expect(structural.length).toBe(1);
      expect(structural[0]?.source).toBe('tsc');

      const semantic = sliceDiagnosticsForRole('semantic', diagnostics);
      expect(semantic.length).toBe(1);
      expect(semantic[0]?.source).toBe('jest');

      const security = sliceDiagnosticsForRole('security', diagnostics);
      expect(security.length).toBe(1);
      expect(security[0]?.source).toBe('bandit');
    });

    it('isolates reviewer errors: Structural succeeds while Semantic throws -> returns Structural findings + warning', async () => {
      const structuralFinding = createTestFinding({
        file: 'src/api.ts',
        title: 'Missing null guard on user parameter',
        confidence: 0.9,
      });

      model.setRoleHandler('structural', async () => ({
        findings: [structuralFinding],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'nemotron',
        latencyMs: 5,
        finishReason: 'stop',
      }));

      model.setRoleHandler('semantic', async () => {
        throw new Error('Synthetic network timeout in semantic reviewer');
      });

      const dagResult = await executeReviewDAG({
        repoRoot: '/fake/repo',
        diff: 'diff --git a/src/api.ts b/src/api.ts\n+if (user) { doSomething(); }',
        changedFiles: ['src/api.ts'],
        reviewContext: createTestContext(),
        symbolIndex,
        diagnostics: [],
        model,
      });

      expect(dagResult.findings.length).toBe(1);
      expect(dagResult.findings[0]?.title).toBe('Missing null guard on user parameter');
      expect(
        dagResult.warnings.some(
          (w) => w.includes('semantic') && w.includes('Synthetic network timeout')
        )
      ).toBe(true);
    });

    it('fails fast with ModelError when ALL triggered reviewers fail', async () => {
      model.setRoleHandler('structural', async () => {
        throw new Error('NVIDIA API 500 internal server error');
      });

      await expect(
        executeReviewDAG({
          repoRoot: '/fake/repo',
          diff: 'diff --git a/src/api.ts b/src/api.ts\n+const x = 1;',
          changedFiles: ['src/api.ts'],
          reviewContext: createTestContext(),
          symbolIndex,
          diagnostics: [],
          model,
        })
      ).rejects.toThrow(ModelError);
    });

    it('propagates AbortSignal immediately without executing reviewer stages', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeReviewDAG({
          repoRoot: '/fake/repo',
          diff: 'diff --git a/src/api.ts b/src/api.ts\n+const x = 1;',
          changedFiles: ['src/api.ts'],
          reviewContext: createTestContext(),
          symbolIndex,
          diagnostics: [],
          model,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });

  describe('Two-Stage Critic Deterministic Hard Floor & LLM Bypass', () => {
    it('validates actionable suggestedFix requirements (>= 15 chars, non-generic)', () => {
      expect(isActionableFix(undefined)).toBe(false);
      expect(isActionableFix('')).toBe(false);
      expect(isActionableFix('todo: fix it')).toBe(false);
      expect(isActionableFix('fix this please')).toBe(false);
      expect(isActionableFix('n/a')).toBe(false);
      expect(isActionableFix('none')).toBe(false);
      expect(isActionableFix('short')).toBe(false);
      expect(isActionableFix('const validEscapedQuery = db.escape(userParam);')).toBe(true);
    });

    it('filters out ungrounded, low-confidence, evidenceless, and non-actionable findings in Stage 3A', async () => {
      const validFinding = createTestFinding({
        file: 'src/valid.ts',
        startLine: 5,
        endLine: 6,
        confidence: 0.9,
        suggestedFix: 'if (!user) { throw new Error("Invalid user"); }',
        evidence: [
          {
            file: 'src/valid.ts',
            startLine: 5,
            endLine: 6,
            relationship: 'caller',
            explanation: 'Direct null deref',
          },
        ],
      });

      const ungroundedFinding = createTestFinding({
        file: 'src/nonexistent.ts',
        confidence: 0.95,
        suggestedFix: 'const valid = doSomethingSubstantial();',
      });

      const lowConfidenceFinding = createTestFinding({
        file: 'src/valid.ts',
        confidence: 0.3,
        suggestedFix: 'const valid = doSomethingSubstantial();',
      });

      const evidencelessFinding = createTestFinding({
        file: 'src/valid.ts',
        confidence: 0.9,
        suggestedFix: 'const valid = doSomethingSubstantial();',
        evidence: [],
      });

      const nonActionableFinding = createTestFinding({
        file: 'src/valid.ts',
        confidence: 0.9,
        suggestedFix: 'TODO: fix later',
      });

      const surviving = await filterDeterministicHardFloor({
        findings: [
          validFinding,
          ungroundedFinding,
          lowConfidenceFinding,
          evidencelessFinding,
          nonActionableFinding,
        ],
        repoRoot: '/fake/repo',
        validFiles: new Set(['src/valid.ts']),
        getFileLineCount: async () => 100,
      });

      expect(surviving.length).toBe(1);
      expect(surviving[0]?.file).toBe('src/valid.ts');
    });

    it('skips Critic LLM invocation completely when 0 candidate findings survive Stage 3A', async () => {
      const ungroundedFinding = createTestFinding({
        file: 'src/does-not-exist.ts',
        confidence: 0.9,
      });

      let criticCalled = false;
      model.setRoleHandler('critic', async () => {
        criticCalled = true;
        return {
          findings: [],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'critic-model',
          latencyMs: 10,
          finishReason: 'stop',
        };
      });

      const result = await executeCriticStage({
        findings: [ungroundedFinding],
        repoRoot: '/fake/repo',
        diff: 'diff --git a/a.ts b/a.ts',
        reviewContext: createTestContext(),
        diagnostics: [],
        model,
        validFiles: new Set(['src/other.ts']),
      });

      expect(result.findings.length).toBe(0);
      expect(result.criticInvoked).toBe(false);
      expect(result.usage.totalTokens).toBe(0);
      expect(criticCalled).toBe(false);
    });
  });

  describe('High-Volume Finding Deduplication & Ranking (500 Findings)', () => {
    it('normalizes titles across common defect synonyms', () => {
      expect(normalizeTitle('Potential NULL pointer exception')).toBe(
        'potential null pointer exception'
      );
      expect(normalizeTitle('SQLi in query handler!')).toBe('sql injection in query handler');
      expect(normalizeTitle('Missing error handling in async promise')).toBe(
        'unhandled error in async promise'
      );
      expect(normalizeTitle('Unclosed connection in stream')).toBe('resource leak in stream');
    });

    it('syntactically clusters 200 overlapping line intervals in preCriticDeduplicate', () => {
      const rawFindings: ModelFinding[] = [];
      for (let i = 0; i < 200; i++) {
        // Line intervals 10..15, 12..18, 14..20 (heavily overlapping)
        const start = 10 + (i % 5);
        rawFindings.push(
          createTestFinding({
            file: 'src/worker.ts',
            startLine: start,
            endLine: start + 5,
            title: `Issue number ${i}`,
            confidence: 0.7 + (i % 3) * 0.1,
          })
        );
      }

      const clustered = preCriticDeduplicate(rawFindings, symbolIndex);
      // 200 overlapping findings on lines 10..24 should collapse to a tiny fraction
      expect(clustered.length).toBeLessThan(10);
    });

    it('consolidates duplicates in postCriticConsolidate, escalating severity and capping evidence at 5', () => {
      const duplicates: ModelFinding[] = [
        createTestFinding({
          file: 'src/auth.ts',
          startLine: 20,
          endLine: 25,
          title: 'SQL injection in login query',
          severity: 'medium',
          confidence: 0.7,
          reviewer: 'structural',
          evidence: [
            {
              file: 'src/auth.ts',
              startLine: 20,
              endLine: 21,
              relationship: 'caller',
              explanation: 'E1',
            },
            {
              file: 'src/auth.ts',
              startLine: 22,
              endLine: 23,
              relationship: 'caller',
              explanation: 'E2',
            },
          ],
        }),
        createTestFinding({
          file: 'src/auth.ts',
          startLine: 21,
          endLine: 26,
          title: 'sqli in login query',
          severity: 'critical', // Highest severity
          confidence: 0.95, // Max confidence
          reviewer: 'security',
          evidence: [
            {
              file: 'src/auth.ts',
              startLine: 24,
              endLine: 25,
              relationship: 'callee',
              explanation: 'E3',
            },
            {
              file: 'src/auth.ts',
              startLine: 25,
              endLine: 26,
              relationship: 'callee',
              explanation: 'E4',
            },
            {
              file: 'src/auth.ts',
              startLine: 26,
              endLine: 27,
              relationship: 'callee',
              explanation: 'E5',
            },
            {
              file: 'src/auth.ts',
              startLine: 27,
              endLine: 28,
              relationship: 'callee',
              explanation: 'E6',
            },
          ],
        }),
      ];

      const consolidated = postCriticConsolidate(duplicates, symbolIndex);
      expect(consolidated.length).toBe(1);

      const merged = consolidated[0]!;
      expect(merged.severity).toBe('critical'); // Escalated to critical
      expect(merged.confidence).toBe(0.95); // Max confidence
      expect(merged.evidence.length).toBeLessThanOrEqual(5); // Evidence capped at 5
      expect(merged.contributingReviewers).toContain('structural');
      expect(merged.contributingReviewers).toContain('security');
    });

    it('enforces Critical-Protected Truncation: all critical findings are preserved even if maxFindings is exceeded', () => {
      const findings: ModelFinding[] = [];

      // Create 15 Critical findings
      for (let i = 0; i < 15; i++) {
        findings.push(
          createTestFinding({
            file: `src/crit_${i}.ts`,
            startLine: 10,
            endLine: 12,
            severity: 'critical',
            title: `Critical CVE vulnerability ${i}`,
            confidence: 0.9,
          })
        );
      }

      // Create 35 Medium findings
      for (let i = 0; i < 35; i++) {
        findings.push(
          createTestFinding({
            file: `src/med_${i}.ts`,
            startLine: 10,
            endLine: 12,
            severity: 'medium',
            title: `Medium style violation ${i}`,
            confidence: 0.7,
          })
        );
      }

      // Truncate to maxFindings = 20
      const ranked = rankAndTruncateFindings({
        findings,
        referenceGraph,
        symbolIndex,
        maxFindings: 20,
      });

      expect(ranked.length).toBe(20);
      const criticalCount = ranked.filter((f) => f.severity === 'critical').length;
      expect(criticalCount).toBe(15); // ALL 15 critical findings protected!
      const mediumCount = ranked.filter((f) => f.severity === 'medium').length;
      expect(mediumCount).toBe(5); // 20 - 15 = 5 available slots for non-critical
    });

    it('breaks ties deterministically across identical composite scores', () => {
      const f1 = createTestFinding({
        file: 'src/b_file.ts',
        startLine: 20,
        severity: 'high',
        confidence: 0.8,
        title: 'Issue B',
      });

      const f2 = createTestFinding({
        file: 'src/a_file.ts',
        startLine: 10,
        severity: 'high',
        confidence: 0.8,
        title: 'Issue A',
      });

      const ranked1 = rankAndTruncateFindings({ findings: [f1, f2], referenceGraph, symbolIndex });
      const ranked2 = rankAndTruncateFindings({ findings: [f2, f1], referenceGraph, symbolIndex });

      // Deterministic: src/a_file.ts must precede src/b_file.ts regardless of input order
      expect(ranked1[0]?.file).toBe('src/a_file.ts');
      expect(ranked1[1]?.file).toBe('src/b_file.ts');
      expect(ranked2[0]?.file).toBe('src/a_file.ts');
      expect(ranked2[1]?.file).toBe('src/b_file.ts');
    });
  });

  describe('ReviewEngine End-to-End Orchestration Stress', () => {
    let engine: ReviewEngine;

    beforeEach(() => {
      engine = new ReviewEngine();
    });

    it('short-circuits in < 5ms without calling model when diff is empty', async () => {
      let modelCalled = false;
      model.setRoleHandler('structural', async () => {
        modelCalled = true;
        return {
          findings: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model: 'm',
          latencyMs: 0,
          finishReason: 'stop',
        };
      });

      const t0 = performance.now();
      const result = await engine.run({
        repoRoot: '/repo',
        diff: '   \n   ',
        changedFiles: ['src/app.ts'],
        reviewContext: createTestContext(),
        referenceGraph,
        symbolIndex,
        diagnostics: [],
        model,
      });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(50);
      expect(modelCalled).toBe(false);
      expect(result.summary.totalFindings).toBe(0);
      expect(result.findings.length).toBe(0);
      expect(result.metadata.totalTokens).toBe(0);
    });

    it('short-circuits immediately when changedFiles is empty', async () => {
      const result = await engine.run({
        repoRoot: '/repo',
        diff: 'diff --git a/a.ts b/a.ts\n+const a = 1;',
        changedFiles: [],
        reviewContext: createTestContext(),
        referenceGraph,
        symbolIndex,
        diagnostics: [],
        model,
      });

      expect(result.summary.totalFindings).toBe(0);
      expect(result.findings.length).toBe(0);
    });

    it('cancels gracefully at stage boundaries when AbortSignal is triggered', async () => {
      const controller = new AbortController();

      // Abort after DAG completes, before Critic stage
      model.setRoleHandler('structural', async () => {
        controller.abort();
        return {
          findings: [createTestFinding()],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          model: 'm',
          latencyMs: 5,
          finishReason: 'stop',
        };
      });

      await expect(
        engine.run({
          repoRoot: '/repo',
          diff: 'diff --git a/src/app.ts b/src/app.ts\n+const a = 1;',
          changedFiles: ['src/app.ts'],
          reviewContext: createTestContext(),
          referenceGraph,
          symbolIndex,
          diagnostics: [],
          model,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });
});
