/**
 * Token estimation, tiered budget partitioning, and knapsack selection.
 * Fast character heuristic (~3.8 chars/token with 10% safety margin).
 */

import type { CandidateItem, ReviewContextMetrics } from '../types.js';

export interface TieredBudget {
  maxTotalTokens: number;
  diffAndSymbolsMax: number;
  diagnosticsAndTypesMax: number;
  callersCalleesMax: number;
  testsAndHistoryMax: number;
}

/**
 * Fast character-to-token heuristic estimation.
 * Formula: Math.ceil(Math.ceil(text.length / 3.8) * 1.1)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(Math.ceil(text.length / 3.8) * 1.1);
}

export class TokenBudgetManager {
  private maxTotalTokens: number;
  private budget: TieredBudget;

  constructor(maxTotalTokens = 12000) {
    // Clamp to valid review range (8k - 16k)
    this.maxTotalTokens = Math.max(8000, Math.min(16000, maxTotalTokens));
    this.budget = this.computeTieredBudget(this.maxTotalTokens);
  }

  /**
   * Returns current tiered budget partitioning.
   */
  public getTieredBudget(): TieredBudget {
    return { ...this.budget };
  }

  /**
   * Dynamically partitions token budget across candidate tiers (D-05):
   * - Diff & changed symbols: 45%
   * - Diagnostics & types: 20%
   * - Callers & callees: 20%
   * - Tests & history: 15%
   */
  private computeTieredBudget(maxTokens: number): TieredBudget {
    const diffAndSymbolsMax = Math.floor(maxTokens * 0.45);
    const diagnosticsAndTypesMax = Math.floor(maxTokens * 0.2);
    const callersCalleesMax = Math.floor(maxTokens * 0.2);
    const testsAndHistoryMax =
      maxTokens - diffAndSymbolsMax - diagnosticsAndTypesMax - callersCalleesMax;

    return {
      maxTotalTokens: maxTokens,
      diffAndSymbolsMax,
      diagnosticsAndTypesMax,
      callersCalleesMax,
      testsAndHistoryMax,
    };
  }

  /**
   * Selects candidate items using greedy knapsack per tier with rollover of unused tokens.
   * Guarantees total selected tokens <= maxTotalTokens.
   */
  public selectCandidates(candidates: CandidateItem[]): {
    selected: CandidateItem[];
    metrics: ReviewContextMetrics;
  } {
    // 1. Group candidates into 4 tiers
    const tier1: CandidateItem[] = []; // changed symbols
    const tier2: CandidateItem[] = []; // diagnostics and types
    const tier3: CandidateItem[] = []; // callers and callees
    const tier4: CandidateItem[] = []; // tests, config, history

    for (const item of candidates) {
      if (item.type === 'changed-symbol') {
        tier1.push(item);
      } else if (item.type === 'diagnostic' || item.type === 'related-type') {
        tier2.push(item);
      } else if (item.type === 'caller' || item.type === 'callee') {
        tier3.push(item);
      } else {
        tier4.push(item);
      }
    }

    // Sort each tier descending by priority score
    const byScoreDesc = (a: CandidateItem, b: CandidateItem) => b.score - a.score;
    tier1.sort(byScoreDesc);
    tier2.sort(byScoreDesc);
    tier3.sort(byScoreDesc);
    tier4.sort(byScoreDesc);

    const selected: CandidateItem[] = [];
    const unselected: CandidateItem[] = [];
    let currentTokens = 0;

    // Helper for tier knapsack
    const fillTier = (tierItems: CandidateItem[], tierBudget: number) => {
      let tierUsed = 0;
      for (const item of tierItems) {
        const cost = estimateTokens(item.content);
        if (tierUsed + cost <= tierBudget && currentTokens + cost <= this.maxTotalTokens) {
          selected.push(item);
          tierUsed += cost;
          currentTokens += cost;
        } else {
          unselected.push(item);
        }
      }
    };

    fillTier(tier1, this.budget.diffAndSymbolsMax);
    fillTier(tier2, this.budget.diagnosticsAndTypesMax);
    fillTier(tier3, this.budget.callersCalleesMax);
    fillTier(tier4, this.budget.testsAndHistoryMax);

    // 2. Rollover: fill leftover total capacity with remaining highest-scoring unselected items
    unselected.sort(byScoreDesc);
    for (const item of unselected) {
      const cost = estimateTokens(item.content);
      if (currentTokens + cost <= this.maxTotalTokens) {
        selected.push(item);
        currentTokens += cost;
      }
    }

    // 3. Compute telemetry metrics
    let candidateTokens = 0;
    for (const item of candidates) {
      candidateTokens += estimateTokens(item.content);
    }

    const metrics: ReviewContextMetrics = {
      candidateCount: candidates.length,
      selectedCount: selected.length,
      candidateTokens,
      selectedTokens: currentTokens,
      selectionRatio:
        candidateTokens > 0 ? Number((currentTokens / candidateTokens).toFixed(4)) : 1.0,
    };

    return { selected, metrics };
  }
}
