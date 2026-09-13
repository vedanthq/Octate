import { describe, expect, it, jest } from '@jest/globals';
import type { Symbol as AnalysisSymbol, ParsedFile } from '../analysis/types.js';
import { ModelError } from '../errors/index.js';
import { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { Diagnostic } from '../model/types.js';
import { createTestContext, createTestFinding, MockReviewModel } from './__tests__/mocks.js';
import { executeReviewDAG, sliceDiagnosticsForRole } from './dag.js';

function createMockSymbolIndex(file: string, symbols: Array<Partial<AnalysisSymbol>>): SymbolIndex {
  const index = new SymbolIndex();
  const parsedSymbols: AnalysisSymbol[] = symbols.map((s, idx) => ({
    id: s.id ?? `sym-${idx}`,
    name: s.name ?? 'testFn',
    kind: s.kind ?? 'function',
    file: s.file ?? file,
    range: s.range ?? { startLine: 1, startColumn: 0, endLine: 20, endColumn: 1 },
    exported: s.exported ?? true,
    language: s.language ?? 'typescript',
    references: s.references ?? [],
  }));

  const parsedFile: ParsedFile = {
    file,
    language: 'typescript',
    tree: null,
    symbols: parsedSymbols,
    parseTimeMs: 1,
  };

  index.addFile(parsedFile);
  return index;
}

describe('executeReviewDAG', () => {
  it('always executes structural reviewer as baseline', async () => {
    const model = new MockReviewModel();
    const structuralFinding = createTestFinding({
      reviewer: 'structural',
      title: 'Structural issue',
    });

    model.setRoleHandler('structural', async () => ({
      findings: [structuralFinding],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    const symbolIndex = new SymbolIndex();
    const result = await executeReviewDAG({
      repoRoot: '/repo',
      diff: '',
      changedFiles: [],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(result.triggeredReviewers).toEqual(['structural']);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Structural issue');
    expect(result.usage.totalTokens).toBe(150);
  });

  it('runs semantic reviewer when executable AST logic modified and skips when comments changed', async () => {
    const model = new MockReviewModel();
    const symbolIndex = createMockSymbolIndex('src/core.ts', [
      {
        name: 'calculateTax',
        kind: 'function',
        range: { startLine: 10, startColumn: 0, endLine: 30, endColumn: 1 },
      },
    ]);

    model.setRoleHandler('structural', async () => ({
      findings: [createTestFinding({ reviewer: 'structural', title: 'Struct issue' })],
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    model.setRoleHandler('semantic', async () => ({
      findings: [createTestFinding({ reviewer: 'semantic', title: 'Sem issue' })],
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    // Diff modifying function AST
    const logicDiff = `
--- a/src/core.ts
+++ b/src/core.ts
@@ -15,3 +15,4 @@
+  taxRate = 0.15;
`;

    const runWithLogic = await executeReviewDAG({
      repoRoot: '/repo',
      diff: logicDiff,
      changedFiles: ['src/core.ts'],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(runWithLogic.triggeredReviewers).toContain('structural');
    expect(runWithLogic.triggeredReviewers).toContain('semantic');
    expect(runWithLogic.findings).toHaveLength(2);

    // Diff modifying only comments outside function
    const commentDiff = `
--- a/src/core.ts
+++ b/src/core.ts
@@ -80,2 +80,2 @@
-// comment
+// updated comment
`;

    const runWithComment = await executeReviewDAG({
      repoRoot: '/repo',
      diff: commentDiff,
      changedFiles: ['src/core.ts'],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(runWithComment.triggeredReviewers).toEqual(['structural']);
    expect(runWithComment.triggeredReviewers).not.toContain('semantic');
  });

  it('runs security reviewer when security keywords or dep files present and skips otherwise', async () => {
    const model = new MockReviewModel();
    const symbolIndex = new SymbolIndex();

    model.setRoleHandler('security', async () => ({
      findings: [createTestFinding({ reviewer: 'security', title: 'Sec issue' })],
      usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    // Diff with security keyword
    const secDiff = `
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,3 +1,4 @@
+const token = jwt.sign(payload, secret);
`;

    const runWithSecurity = await executeReviewDAG({
      repoRoot: '/repo',
      diff: secDiff,
      changedFiles: ['src/login.ts'],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(runWithSecurity.triggeredReviewers).toContain('security');
    expect(runWithSecurity.findings.some((f) => f.reviewer === 'security')).toBe(true);

    // Diff touching package.json
    const runWithDep = await executeReviewDAG({
      repoRoot: '/repo',
      diff: '+ "lodash": "4.17.21"',
      changedFiles: ['package.json'],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(runWithDep.triggeredReviewers).toContain('security');
  });

  it('implements graceful degradation when a single reviewer crashes', async () => {
    const model = new MockReviewModel();
    const symbolIndex = new SymbolIndex();

    // Structural succeeds
    model.setRoleHandler('structural', async () => ({
      findings: [createTestFinding({ reviewer: 'structural', title: 'Survivor finding' })],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-nemotron',
      latencyMs: 10,
      finishReason: 'stop',
    }));

    // Security throws error
    model.setRoleHandler('security', async () => {
      await Promise.resolve();
      throw new Error('NVIDIA API timeout on security reviewer');
    });

    const diff = '+ const token = jwt.sign();';
    const result = await executeReviewDAG({
      repoRoot: '/repo',
      diff,
      changedFiles: ['src/auth.ts'],
      reviewContext: createTestContext(),
      symbolIndex,
      diagnostics: [],
      model,
    });

    expect(result.triggeredReviewers).toContain('structural');
    expect(result.triggeredReviewers).toContain('security');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('[security] reviewer failed: NVIDIA API timeout');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Survivor finding');
  });

  it('throws ModelError when all triggered reviewers crash', async () => {
    const model = new MockReviewModel();
    const symbolIndex = new SymbolIndex();

    model.setRoleHandler('structural', async () => {
      await Promise.resolve();
      throw new Error('Connection refused to model backend');
    });

    await expect(
      executeReviewDAG({
        repoRoot: '/repo',
        diff: '',
        changedFiles: [],
        reviewContext: createTestContext(),
        symbolIndex,
        diagnostics: [],
        model,
      })
    ).rejects.toThrow(ModelError);
  });

  it('aborts execution when cancellation signal is aborted', async () => {
    const model = new MockReviewModel();
    const symbolIndex = new SymbolIndex();
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeReviewDAG({
        repoRoot: '/repo',
        diff: '',
        changedFiles: [],
        reviewContext: createTestContext(),
        symbolIndex,
        diagnostics: [],
        model,
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('fast-paths doc-only diffs without invoking any model reviewers', async () => {
    const model = new MockReviewModel();
    const generateSpy = jest.spyOn(model, 'generate');

    const result = await executeReviewDAG({
      repoRoot: '/repo',
      diff: '+++ b/docs/readme.md\n+Added docs',
      changedFiles: ['docs/readme.md'],
      reviewContext: createTestContext(),
      symbolIndex: new SymbolIndex(),
      diagnostics: [],
      model,
    });

    expect(result.triggeredReviewers).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.rawCounts).toEqual({ structural: 0, semantic: 0, security: 0 });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('fast-paths test-only diffs without invoking any model reviewers', async () => {
    const model = new MockReviewModel();
    const generateSpy = jest.spyOn(model, 'generate');

    const result = await executeReviewDAG({
      repoRoot: '/repo',
      diff: '+++ b/test/app.test.ts\n+expect(true).toBe(true);',
      changedFiles: ['test/app.test.ts'],
      reviewContext: createTestContext(),
      symbolIndex: new SymbolIndex(),
      diagnostics: [],
      model,
    });

    expect(result.triggeredReviewers).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.rawCounts).toEqual({ structural: 0, semantic: 0, security: 0 });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('records rawCounts accurately across triggered reviewers', async () => {
    const model = new MockReviewModel();
    model.setRoleHandler('structural', async () => ({
      findings: [
        createTestFinding({ reviewer: 'structural', title: 'Struct 1' }),
        createTestFinding({ reviewer: 'structural', title: 'Struct 2' }),
      ],
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    }));

    const result = await executeReviewDAG({
      repoRoot: '/repo',
      diff: '+++ b/src/code.ts\n+const x = 1;',
      changedFiles: ['src/code.ts'],
      reviewContext: createTestContext(),
      symbolIndex: new SymbolIndex(),
      diagnostics: [],
      model,
    });

    expect(result.rawCounts.structural).toBe(2);
    expect(result.rawCounts.semantic).toBe(0);
    expect(result.rawCounts.security).toBe(0);
  });
});

describe('sliceDiagnosticsForRole', () => {
  const diagnostics: Diagnostic[] = [
    {
      file: 'src/app.ts',
      startLine: 10,
      startColumn: 1,
      endLine: 10,
      endColumn: 10,
      severity: 'high',
      message: 'Type error: number not assignable to string',
      source: 'tsc',
    },
    {
      file: 'src/app.test.ts',
      startLine: 25,
      startColumn: 1,
      endLine: 25,
      endColumn: 15,
      severity: 'medium',
      message: 'Assertion failed: expected true but received false',
      source: 'jest',
    },
    {
      file: 'src/auth.ts',
      startLine: 5,
      startColumn: 1,
      endLine: 5,
      endColumn: 20,
      severity: 'critical',
      message: 'Hardcoded secret detected',
      source: 'bandit',
      rule: 'security/no-secret',
    },
  ];

  it('slices compiler diagnostics to structural role', () => {
    const structural = sliceDiagnosticsForRole('structural', diagnostics);
    expect(structural).toHaveLength(1);
    expect(structural[0]?.source).toBe('tsc');
  });

  it('slices test runner diagnostics to semantic role', () => {
    const semantic = sliceDiagnosticsForRole('semantic', diagnostics);
    expect(semantic).toHaveLength(1);
    expect(semantic[0]?.source).toBe('jest');
  });

  it('slices scanner advisories to security role', () => {
    const security = sliceDiagnosticsForRole('security', diagnostics);
    expect(security).toHaveLength(1);
    expect(security[0]?.source).toBe('bandit');
  });
});
