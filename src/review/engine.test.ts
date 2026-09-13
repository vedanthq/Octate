import { beforeEach, describe, expect, it } from '@jest/globals';
import { ReferenceGraph } from '../intelligence/graph/reference.js';
import { SymbolIndex } from '../intelligence/index/symbol-index.js';
import { createTestContext, createTestFinding, MockReviewModel } from './__tests__/mocks.js';
import { createReviewEngine, type ReviewEngine } from './engine.js';
import type { ReviewEngineInput } from './types.js';

describe('ReviewEngine', () => {
  let engine: ReviewEngine;
  let model: MockReviewModel;
  let referenceGraph: ReferenceGraph;
  let symbolIndex: SymbolIndex;

  beforeEach(() => {
    engine = createReviewEngine();
    model = new MockReviewModel();
    referenceGraph = new ReferenceGraph();
    symbolIndex = new SymbolIndex();
  });

  function createInput(overrides: Partial<ReviewEngineInput> = {}): ReviewEngineInput {
    return {
      repoRoot: '/repo',
      diff: 'diff --git a/src/handler.ts b/src/handler.ts\n+const x = user.profile;',
      changedFiles: ['src/handler.ts'],
      reviewContext: createTestContext(),
      referenceGraph,
      symbolIndex,
      diagnostics: [],
      model,
      config: {
        severity: 'medium',
        failOnSeverity: 'critical',
        maxFindings: 50,
        minConfidence: 0.6,
      },
      scopeMetadata: {
        scopeType: 'working-tree',
        base: 'HEAD',
        head: 'working-tree',
      },
      ...overrides,
    };
  }

  it('runs complete review pipeline producing an authoritative ReviewResult', async () => {
    const finding = createTestFinding({
      severity: 'high',
      category: 'security',
      title: 'SQL injection in query handler',
      message: 'Unescaped user input passed to query execution',
      file: 'src/handler.ts',
      startLine: 10,
      endLine: 12,
      confidence: 0.95,
      suggestedFix: 'const query = db.escape(userInput); return run(query);',
    });

    // Structural stage handler
    model.setRoleHandler('structural', async () => ({
      findings: [finding],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    // Critic stage handler returns curated finding
    model.setRoleHandler('critic', async () => ({
      findings: [finding],
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    const result = await engine.run(createInput());

    expect(result).toBeDefined();
    expect(result.summary.totalFindings).toBe(1);
    expect(result.summary.bySeverity.high).toBe(1);
    expect(result.summary.byCategory.security).toBe(1);
    expect(result.summary.filesAnalyzed).toBe(1);
    expect(result.summary.durationMs).toBeGreaterThanOrEqual(0);

    expect(result.findings.length).toBe(1);
    const topFinding = result.findings[0];
    expect(topFinding).toBeDefined();
    if (!topFinding) throw new Error('Expected top finding');
    expect(topFinding.severity).toBe('high');
    expect(topFinding.category).toBe('security');
    expect(topFinding.compositeScore).toBeGreaterThan(0);
    expect(topFinding.scoreBreakdown).toBeDefined();
    expect(topFinding.blastRadius).toBeDefined();
    expect(topFinding.evidenceStrength).toBeDefined();
    expect(topFinding.contributingReviewers).toContain('structural');

    expect(result.metadata.scopeType).toBe('working-tree');
    expect(result.metadata.version).toBe('0.1.0');
    expect(result.metadata.criticInvoked).toBe(true);
    expect(result.metadata.preCriticFindingCount).toBe(1);
    expect(result.metadata.postCriticFindingCount).toBe(1);
    expect(result.metadata.stageCounts).toBeDefined();
    expect(result.metadata.stageCounts?.rawStructural).toBe(1);
    expect(result.metadata.stageCounts?.preCriticDedup).toBe(1);
    expect(result.metadata.stageCounts?.criticStage1).toBe(1);
    expect(result.metadata.stageCounts?.criticStage2).toBe(1);
    expect(result.metadata.stageCounts?.final).toBe(1);
  });

  it('short-circuits on empty diff returning clean ReviewResult with 0 tokens', async () => {
    const input = createInput({
      diff: '',
      changedFiles: [],
    });

    const result = await engine.run(input);

    expect(result.findings.length).toBe(0);
    expect(result.summary.totalFindings).toBe(0);
    expect(result.metadata.totalTokens).toBe(0);
    expect(result.metadata.promptTokens).toBe(0);
    expect(result.metadata.completionTokens).toBe(0);
    expect(result.metadata.criticInvoked).toBe(false);
    expect(model.calls.length).toBe(0);
  });

  it('accurately aggregates token usage across DAG and Critic stages', async () => {
    const finding = createTestFinding();

    model.setRoleHandler('structural', async () => ({
      findings: [finding],
      usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    model.setRoleHandler('critic', async () => ({
      findings: [finding],
      usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    const result = await engine.run(createInput());

    expect(result.metadata.promptTokens).toBe(250); // 150 + 100
    expect(result.metadata.completionTokens).toBe(110); // 50 + 60
    expect(result.metadata.totalTokens).toBe(360); // 200 + 160
  });

  it('records warnings when a reviewer degrades gracefully', async () => {
    // Diff modifies function AST logic (triggering semantic reviewer)
    const diffWithFunction =
      'diff --git a/src/handler.ts b/src/handler.ts\n' +
      '@@ -1,5 +1,5 @@\n' +
      '+function calculateTotal(items: number[]): number {\n' +
      '+  return items.reduce((a, b) => a + b, 0);\n' +
      '+}\n';

    const finding = createTestFinding({ reviewer: 'structural' });

    model.setRoleHandler('structural', async () => ({
      findings: [finding],
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    // Semantic reviewer fails
    model.setRoleHandler('semantic', () => {
      return Promise.reject(new Error('Semantic model timeout'));
    });

    model.setRoleHandler('critic', async () => ({
      findings: [finding],
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    const result = await engine.run(
      createInput({
        diff: diffWithFunction,
      })
    );

    expect(result.metadata.warnings.length).toBeGreaterThan(0);
    expect(
      result.metadata.warnings.some((w) => w.includes('semantic') && w.includes('timeout'))
    ).toBe(true);
    expect(result.findings.length).toBe(1); // Structural finding preserved
  });

  it('terminates promptly with abort error when AbortSignal is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    const input = createInput({
      signal: controller.signal,
    });

    await expect(engine.run(input)).rejects.toThrow();
  });
});
