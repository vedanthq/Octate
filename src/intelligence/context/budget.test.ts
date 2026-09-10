import { describe, expect, it } from '@jest/globals';
import type { CandidateItem } from '../types.js';
import { estimateTokens, TokenBudgetManager } from './budget.js';

describe('TokenBudgetManager', () => {
  it('estimates tokens with character heuristic plus 10% safety margin', () => {
    // 38 characters: Math.ceil(38 / 3.8) = 10; Math.ceil(10 * 1.1) = 11
    const text38 = 'a'.repeat(38);
    expect(estimateTokens(text38)).toBe(11);

    expect(estimateTokens('')).toBe(0);
  });

  it('clamps budget between 8000 and 16000 tokens', () => {
    const low = new TokenBudgetManager(4000);
    expect(low.getTieredBudget().maxTotalTokens).toBe(8000);

    const high = new TokenBudgetManager(30000);
    expect(high.getTieredBudget().maxTotalTokens).toBe(16000);

    const normal = new TokenBudgetManager(10000);
    expect(normal.getTieredBudget().maxTotalTokens).toBe(10000);
  });

  it('partitions budget into tiers matching D-05 ratios', () => {
    const mgr = new TokenBudgetManager(10000);
    const budget = mgr.getTieredBudget();

    expect(budget.diffAndSymbolsMax).toBe(4500); // 45%
    expect(budget.diagnosticsAndTypesMax).toBe(2000); // 20%
    expect(budget.callersCalleesMax).toBe(2000); // 20%
    expect(budget.testsAndHistoryMax).toBe(1500); // 15%
    expect(
      budget.diffAndSymbolsMax +
        budget.diagnosticsAndTypesMax +
        budget.callersCalleesMax +
        budget.testsAndHistoryMax
    ).toBe(10000);
  });

  it('greedily selects candidates and rolls over unused budget', () => {
    const mgr = new TokenBudgetManager(8000);

    // Create candidates
    const candidates: CandidateItem[] = [
      {
        id: 'sym-1',
        file: 'src/main.ts',
        startLine: 1,
        endLine: 10,
        content: 'const x = 1;',
        score: 100,
        type: 'changed-symbol',
        reason: 'changed',
      },
      {
        id: 'caller-1',
        file: 'src/caller.ts',
        startLine: 1,
        endLine: 10,
        content: 'const y = 2;',
        score: 90,
        type: 'caller',
        reason: 'caller',
      },
      {
        id: 'test-1',
        file: 'src/main.test.ts',
        startLine: 1,
        endLine: 10,
        content: 'test("foo", () => {});',
        score: 80,
        type: 'test',
        reason: 'test',
      },
    ];

    const result = mgr.selectCandidates(candidates);
    expect(result.selected).toHaveLength(3);
    expect(result.metrics.candidateCount).toBe(3);
    expect(result.metrics.selectedCount).toBe(3);
    expect(result.metrics.selectedTokens).toBeLessThanOrEqual(8000);
    expect(result.metrics.selectionRatio).toBe(1.0);
  });

  it('enforces total token ceiling strictly', () => {
    const mgr = new TokenBudgetManager(8000);

    // Candidate with 9000 tokens
    const massiveContent = 'x'.repeat(30000);
    const candidates: CandidateItem[] = [
      {
        id: 'sym-massive',
        file: 'src/massive.ts',
        startLine: 1,
        endLine: 1000,
        content: massiveContent,
        score: 100,
        type: 'changed-symbol',
        reason: 'massive file',
      },
    ];

    const result = mgr.selectCandidates(candidates);
    expect(result.selected).toHaveLength(0); // Cannot fit into 8000 tokens
    expect(result.metrics.selectedTokens).toBe(0);
  });
});
