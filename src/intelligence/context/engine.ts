/**
 * Context Engine orchestrating candidate collection, token budgeting,
 * call-site windowing, and diff overflow protection to produce ReviewContext.
 */

import type { ContextItem, Diagnostic } from '../../model/types.js';
import type { ReferenceGraph } from '../graph/reference.js';
import type { SymbolIndex } from '../index/symbol-index.js';
import type { ReviewContext } from '../types.js';
import { estimateTokens, TokenBudgetManager } from './budget.js';
import { CandidateCollector } from './candidates.js';

export interface BuildContextOptions {
  changedFiles: string[];
  diff: string;
  symbolIndex: SymbolIndex;
  referenceGraph: ReferenceGraph;
  diagnostics?: Diagnostic[] | undefined;
  readFile: (filePath: string) => Promise<string>;
  maxTokens?: number | undefined;
}

export interface ContextEngineOptions {
  budgetManager?: TokenBudgetManager | undefined;
  candidateCollector?: CandidateCollector | undefined;
}

export class ContextEngine {
  private budgetManager: TokenBudgetManager;
  private candidateCollector: CandidateCollector;

  constructor(options?: ContextEngineOptions) {
    this.budgetManager = options?.budgetManager ?? new TokenBudgetManager();
    this.candidateCollector = options?.candidateCollector ?? new CandidateCollector();
  }

  /**
   * Builds bounded ReviewContext for AI reviewers.
   */
  public async buildContext(options: BuildContextOptions): Promise<ReviewContext> {
    const { changedFiles, diff, symbolIndex, referenceGraph, diagnostics, readFile, maxTokens } =
      options;

    const budgetMgr = maxTokens ? new TokenBudgetManager(maxTokens) : this.budgetManager;
    const tieredBudget = budgetMgr.getTieredBudget();

    // 1. Check diff budget overflow (D-08): if diff exceeds 50% of budget, prioritize high-signal files
    const effectiveDiff = this.handleDiffOverflow(
      diff,
      Math.floor(tieredBudget.maxTotalTokens * 0.5)
    );

    // 2. Collect candidate items
    const candidates = await this.candidateCollector.collect({
      changedFiles,
      diff: effectiveDiff,
      symbolIndex,
      referenceGraph,
      diagnostics,
      readFile,
    });

    // 3. Select candidates within token budget
    const { selected, metrics } = budgetMgr.selectCandidates(candidates);

    // 4. Convert selected candidates to ContextItem[]
    const items: ContextItem[] = selected.map((item) => ({
      file: item.file,
      startLine: item.startLine,
      endLine: item.endLine,
      content: item.content,
      relevanceScore: item.score,
      type: item.type,
    }));

    const contextSnippets = selected.map((item) => item.content);
    const diffTokens = estimateTokens(effectiveDiff);
    const totalTokens = metrics.selectedTokens + diffTokens;

    return {
      trustedHeader: '',
      diagnosticsBlock: '',
      contextSnippets,
      totalTokens,
      metrics,
      items,
    };
  }

  /**
   * Protects against diff overflow (D-08):
   * If diff exceeds maxDiffTokens, prioritize high-signal logic files over low-signal files (lockfiles, generated, tests).
   */
  private handleDiffOverflow(diff: string, maxDiffTokens: number): string {
    const initialTokens = estimateTokens(diff);
    if (initialTokens <= maxDiffTokens) {
      return diff;
    }

    // Split diff into file chunks by "diff --git "
    const chunks = diff.split(/(?=^diff --git )/m);
    if (chunks.length <= 1) {
      // Single massive file diff, truncate directly
      const lines = diff.split('\n');
      const allowedLines = Math.floor(maxDiffTokens * 3.0);
      return `${lines.slice(0, allowedLines).join('\n')}\n\n// Warning: Diff truncated to stay within token budget ceiling.`;
    }

    // Classify and sort chunks: logic files first, then tests, deprioritize lockfiles/generated
    const scoredChunks = chunks.map((chunk) => {
      const firstLine = chunk.split('\n')[0] ?? '';
      let priority = 1; // High signal logic code

      if (
        firstLine.includes('lock.yaml') ||
        firstLine.includes('package-lock.json') ||
        firstLine.includes('.lock') ||
        firstLine.includes('.min.')
      ) {
        priority = 4; // Low signal lockfile/bundle
      } else if (firstLine.includes('.test.') || firstLine.includes('.spec.')) {
        priority = 2; // Test code
      } else if (firstLine.includes('.json') || firstLine.includes('.md')) {
        priority = 3; // Docs/config
      }

      return { chunk, priority, tokens: estimateTokens(chunk) };
    });

    scoredChunks.sort((a, b) => a.priority - b.priority);

    const keptChunks: string[] = [];
    let accumulatedTokens = 0;
    let omittedCount = 0;

    for (const sc of scoredChunks) {
      if (accumulatedTokens + sc.tokens <= maxDiffTokens) {
        keptChunks.push(sc.chunk);
        accumulatedTokens += sc.tokens;
      } else {
        omittedCount++;
      }
    }

    const warning =
      omittedCount > 0
        ? `\n\n// Warning: Diff exceeded 50% token budget. Omitted ${omittedCount} low-signal or oversized file diffs.`
        : '';

    return `${keptChunks.join('')}${warning}`;
  }
}

/**
 * Factory helper for ContextEngine.
 */
export function createContextEngine(maxTokens?: number): ContextEngine {
  const budgetManager = maxTokens ? new TokenBudgetManager(maxTokens) : new TokenBudgetManager();
  return new ContextEngine({ budgetManager });
}
