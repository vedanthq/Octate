import { describe, expect, it } from '@jest/globals';
import type { ModelFinding } from '../types.js';
import { type GroundingContext, groundFinding, groundFindings } from './grounding.js';

describe('groundFinding', () => {
  const baseFinding: ModelFinding = {
    severity: 'medium',
    category: 'correctness',
    title: 'Potential null dereference',
    message: 'Value can be null',
    file: 'src/utils/math.ts',
    startLine: 10,
    endLine: 25,
    confidence: 0.8,
    evidence: [
      {
        file: 'src/utils/math.ts',
        startLine: 8,
        endLine: 30,
        relationship: 'context',
        explanation: 'Declaration here',
      },
    ],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'Crash on null',
    suggestedFix: 'Add null check',
    reviewer: 'semantic',
  };

  const dummyContext: GroundingContext = {
    repoRoot: '/workspace',
  };

  it('rejects path traversal with ..', async () => {
    const finding: ModelFinding = {
      ...baseFinding,
      file: '../etc/passwd',
    };
    const res = await groundFinding(finding, dummyContext);
    expect(res).toBeNull();
  });

  it('rejects absolute paths', async () => {
    const finding: ModelFinding = {
      ...baseFinding,
      file: '/etc/shadow',
    };
    const res = await groundFinding(finding, dummyContext);
    expect(res).toBeNull();
  });

  it('normalizes leading ./ from path', async () => {
    const finding: ModelFinding = {
      ...baseFinding,
      file: './src/utils/math.ts',
    };
    const res = await groundFinding(finding, dummyContext);
    expect(res).not.toBeNull();
    expect(res?.file).toBe('src/utils/math.ts');
  });

  it('rejects file when not in validFiles whitelist', async () => {
    const ctx: GroundingContext = {
      repoRoot: '/workspace',
      validFiles: new Set(['src/index.ts']),
    };
    const res = await groundFinding(baseFinding, ctx);
    expect(res).toBeNull();
  });

  it('clamps endLine to file totalLines when exceeding length', async () => {
    const ctx: GroundingContext = {
      repoRoot: '/workspace',
      getFileLineCount: async () => 20,
    };
    const res = await groundFinding(baseFinding, ctx);
    expect(res).not.toBeNull();
    expect(res?.startLine).toBe(10);
    expect(res?.endLine).toBe(20);
    expect(res?.evidence[0]?.endLine).toBe(20);
  });

  it('drops phantom findings when startLine exceeds totalLines', async () => {
    const ctx: GroundingContext = {
      repoRoot: '/workspace',
      getFileLineCount: async () => 5, // file only has 5 lines, startLine is 10
    };
    const res = await groundFinding(baseFinding, ctx);
    expect(res).toBeNull();
  });
});

describe('groundFindings', () => {
  it('filters out invalid and non-existent files', async () => {
    const valid: ModelFinding = {
      severity: 'low',
      category: 'testing',
      title: 'Missing test',
      message: 'Add test',
      file: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      confidence: 1,
      evidence: [],
      relatedFiles: [],
      relatedSymbols: [],
      impact: '',
      suggestedFix: '',
      reviewer: 'semantic',
    };
    const invalidTraversal: ModelFinding = {
      ...valid,
      file: '../../bad.ts',
    };
    const nonexistent: ModelFinding = {
      ...valid,
      file: 'src/missing.ts',
    };

    const ctx: GroundingContext = {
      repoRoot: '/workspace',
      validFiles: new Set(['src/a.ts']),
    };

    const grounded = await groundFindings([valid, invalidTraversal, nonexistent], ctx);
    expect(grounded.length).toBe(1);
    expect(grounded[0]?.file).toBe('src/a.ts');
  });
});
