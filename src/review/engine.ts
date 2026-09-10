/**
 * Authoritative Layer 5 Review Engine Orchestrator.
 *
 * Coordinates the full review pipeline (REV-01, REV-02, REV-03, REV-04):
 * 1. Cancellation checks at stage boundaries (D-16)
 * 2. Empty diff short-circuiting
 * 3. Stage 1 (DAG): Concurrent reviewer DAG execution with graceful degradation
 * 4. Stage 2 (Pre-Critic Dedup): Syntactic clustering to reduce token footprint
 * 5. Stage 3 (Two-Stage Critic): Deterministic hard floor + LLM Critic quality gate
 * 6. Stage 4 (Post-Critic Consolidation): Multi-factor deduplication
 * 7. Stage 5 (Ranking): Composite confidence-weighted ranking with Critical protection
 * 8. Assembly of authoritative ReviewResult domain model
 */

import { createLogger } from '../logging/index.js';
import { executeCriticStage } from './critic.js';
import { executeReviewDAG } from './dag.js';
import { postCriticConsolidate, preCriticDeduplicate } from './dedup.js';
import { rankAndTruncateFindings } from './ranking.js';
import type {
  ExecutionMetadata,
  FindingCategory,
  ReviewEngineInput,
  ReviewResult,
  ReviewSeverity,
  ReviewSummary,
} from './types.js';

const log = createLogger('review/engine');

export class ReviewEngine {
  /**
   * Executes the full Layer 5 review pipeline.
   *
   * @param input - Complete inputs required for review execution
   * @returns Authoritative ReviewResult domain object
   */
  public async run(input: ReviewEngineInput): Promise<ReviewResult> {
    const startTime = Date.now();
    input.signal?.throwIfAborted();

    const modelName =
      (input.model as { modelName?: string }).modelName ??
      (input.model as { modelId?: string }).modelId ??
      'unknown';

    // Fast short-circuit on empty diff or zero files
    if (!input.diff.trim() || input.changedFiles.length === 0) {
      log.info('Empty diff or no changed files provided; short-circuiting review');
      const durationMs = Date.now() - startTime;

      return {
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
          filesAnalyzed: input.changedFiles.length,
          durationMs,
        },
        findings: [],
        metadata: {
          scopeType: input.scopeMetadata?.scopeType ?? 'working-tree',
          base: input.scopeMetadata?.base,
          head: input.scopeMetadata?.head,
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          model: modelName,
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
    }

    log.info(
      {
        changedFilesCount: input.changedFiles.length,
        scopeType: input.scopeMetadata?.scopeType ?? 'working-tree',
      },
      'Review engine pipeline started'
    );

    // Stage 1: Review DAG (Structural baseline + conditional Semantic/Security)
    input.signal?.throwIfAborted();
    const dagResult = await executeReviewDAG({
      repoRoot: input.repoRoot,
      diff: input.diff,
      changedFiles: input.changedFiles,
      reviewContext: input.reviewContext,
      symbolIndex: input.symbolIndex,
      diagnostics: input.diagnostics,
      model: input.model,
      signal: input.signal,
    });

    log.info(
      {
        candidateCount: dagResult.findings.length,
        warningsCount: dagResult.warnings.length,
        triggeredReviewers: dagResult.triggeredReviewers,
      },
      'Stage 1 (Review DAG) completed'
    );

    // Stage 2: Pre-Critic Deduplication (Syntactic clustering)
    input.signal?.throwIfAborted();
    const preCriticFindings = preCriticDeduplicate(
      dagResult.findings,
      input.symbolIndex
    );
    const preCriticCount = preCriticFindings.length;

    log.info(
      {
        rawCount: dagResult.findings.length,
        dedupedCount: preCriticCount,
      },
      'Stage 2 (Pre-Critic Dedup) completed'
    );

    // Stage 3: Two-Stage Critic Quality Gate (Deterministic floor + critic.v1 model)
    input.signal?.throwIfAborted();
    const criticResult = await executeCriticStage({
      findings: preCriticFindings,
      repoRoot: input.repoRoot,
      diff: input.diff,
      reviewContext: input.reviewContext,
      diagnostics: input.diagnostics,
      model: input.model,
      minConfidence:
        (input.config as { minConfidence?: number } | undefined)?.minConfidence ?? 0.6,
      signal: input.signal,
    });

    log.info(
      {
        criticInvoked: criticResult.criticInvoked,
        curatedCount: criticResult.findings.length,
      },
      'Stage 3 (Two-Stage Critic) completed'
    );

    // Stage 4: Post-Critic Multi-Factor Consolidation
    input.signal?.throwIfAborted();
    const postCriticFindings = postCriticConsolidate(
      criticResult.findings,
      input.symbolIndex
    );
    const postCriticCount = postCriticFindings.length;

    log.info(
      {
        consolidatedCount: postCriticCount,
      },
      'Stage 4 (Post-Critic Consolidation) completed'
    );

    // Stage 5: Composite Ranking & Critical-Protected Truncation
    input.signal?.throwIfAborted();
    const rankedFindings = rankAndTruncateFindings({
      findings: postCriticFindings,
      referenceGraph: input.referenceGraph,
      symbolIndex: input.symbolIndex,
      minSeverity: input.config?.severity,
      maxFindings: input.config?.maxFindings ?? 50,
    });

    log.info(
      {
        rankedCount: rankedFindings.length,
      },
      'Stage 5 (Composite Ranking & Truncation) completed'
    );

    // Construct ReviewSummary
    const bySeverity: Record<ReviewSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    const byCategory: Record<FindingCategory, number> = {
      correctness: 0,
      security: 0,
      performance: 0,
      architecture: 0,
      reliability: 0,
      maintainability: 0,
      compatibility: 0,
      testing: 0,
    };
    const byReviewer: Record<string, number> = {};

    for (const finding of rankedFindings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;

      for (const rev of finding.contributingReviewers) {
        byReviewer[rev] = (byReviewer[rev] ?? 0) + 1;
      }
    }

    const durationMs = Date.now() - startTime;

    const summary: ReviewSummary = {
      totalFindings: rankedFindings.length,
      bySeverity,
      byCategory,
      byReviewer,
      filesAnalyzed: input.changedFiles.length,
      durationMs,
    };

    // Aggregate token counts
    const promptTokens =
      (dagResult.usage.promptTokens ?? 0) + (criticResult.usage.promptTokens ?? 0);
    const completionTokens =
      (dagResult.usage.completionTokens ?? 0) +
      (criticResult.usage.completionTokens ?? 0);
    const totalTokens =
      (dagResult.usage.totalTokens ?? 0) + (criticResult.usage.totalTokens ?? 0);

    const metadata: ExecutionMetadata = {
      scopeType: input.scopeMetadata?.scopeType ?? 'working-tree',
      base: input.scopeMetadata?.base,
      head: input.scopeMetadata?.head,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      model: modelName,
      totalTokens,
      promptTokens,
      completionTokens,
      warnings: dagResult.warnings,
      reviewersTriggered: dagResult.triggeredReviewers,
      criticInvoked: criticResult.criticInvoked,
      preCriticFindingCount: preCriticCount,
      postCriticFindingCount: postCriticCount,
    };

    log.info(
      {
        totalFindings: rankedFindings.length,
        durationMs,
        totalTokens,
      },
      'Review engine pipeline completed successfully'
    );

    return {
      summary,
      findings: rankedFindings,
      metadata,
    };
  }
}

/**
 * Factory function creating a new ReviewEngine instance.
 */
export function createReviewEngine(): ReviewEngine {
  return new ReviewEngine();
}
