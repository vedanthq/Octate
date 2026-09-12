/**
 * Staged Review DAG Concurrency Runner with Graceful Degradation.
 *
 * Orchestrates reviewer execution:
 * 1. Structural Reviewer baseline runs first (API contract, nullability, resource handling).
 * 2. Deterministic heuristics conditionally trigger Semantic and Security reviewers.
 * 3. Concurrency bounded by PromisePool(2) to respect provider rate limits.
 * 4. Diagnostics are role-sliced (compiler for Structural, tests for Semantic, advisories for Security).
 * 5. Reviewer failures degrade gracefully by recording warnings without aborting surviving reviewers.
 */

import { createPromisePool } from '../cache/pool.js';
import { ModelError } from '../errors/index.js';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ReviewContext } from '../intelligence/types.js';
import { createLogger } from '../logging/index.js';
import { FINDINGS_OUTPUT_SCHEMA } from '../model/index.js';
import type {
  Diagnostic,
  ModelFinding,
  ModelRequest,
  ModelUsage,
  ReviewModel,
} from '../model/types.js';
import { shouldTriggerSecurityReviewer, shouldTriggerSemanticReviewer } from './heuristics.js';

const log = createLogger('review/dag');

export type ReviewerRole = 'structural' | 'semantic' | 'security';

/**
 * Role-specialized task descriptions for model prompts.
 */
export const ROLE_TASKS: Record<ReviewerRole, string> = {
  structural:
    'Structural code review: analyze contract adherence, nullability, and resource handling',
  semantic: 'Semantic code review: analyze business logic and edge cases',
  security: 'Security code review: identify security vulnerabilities and untrusted data flows',
};

/**
 * Parameters for executing the Review DAG.
 */
export interface DAGParams {
  repoRoot: string;
  diff: string;
  changedFiles: string[];
  reviewContext: ReviewContext;
  symbolIndex: SymbolIndex;
  diagnostics: Diagnostic[];
  model: ReviewModel;
  projectRules?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Result of executing the staged Review DAG.
 */
export interface DAGResult {
  findings: ModelFinding[];
  warnings: string[];
  triggeredReviewers: string[];
  usage: ModelUsage;
}

const SECURITY_SOURCES = new Set(['bandit', 'semgrep', 'snyk', 'trivy', 'audit', 'security']);

const TEST_SOURCES = new Set(['jest', 'pytest', 'vitest', 'unittest', 'test']);

/**
 * Slices static analysis diagnostics specific to reviewer responsibilities (D-04).
 */
export function sliceDiagnosticsForRole(
  role: ReviewerRole,
  diagnostics: Diagnostic[]
): Diagnostic[] {
  return diagnostics.filter((diag) => {
    const src = diag.source.toLowerCase();
    const rule = (diag.rule ?? '').toLowerCase();
    const msg = diag.message.toLowerCase();

    const isSecurity =
      SECURITY_SOURCES.has(src) ||
      src.includes('security') ||
      rule.includes('security') ||
      rule.includes('injection') ||
      rule.includes('cwe') ||
      msg.includes('vulnerability') ||
      msg.includes('cwe-');

    const isTest =
      TEST_SOURCES.has(src) ||
      src.includes('test') ||
      rule.includes('test') ||
      rule.includes('assert');

    if (role === 'security') {
      return isSecurity;
    }
    if (role === 'semantic') {
      return isTest;
    }
    if (role === 'structural') {
      // Structural gets compiler errors (tsc, mypy, pyright) and structural linters
      return !isSecurity && !isTest;
    }
    return true;
  });
}

/**
 * Helper to build a role-specialized ModelRequest.
 */
function buildModelRequest(role: ReviewerRole, params: DAGParams): ModelRequest {
  const roleDiagnostics = sliceDiagnosticsForRole(role, params.diagnostics);

  return {
    systemPolicy:
      'Act as an expert code reviewer specializing in software correctness, reliability, security, and maintainability.',
    reviewTask: ROLE_TASKS[role],
    projectRules: params.projectRules ?? [],
    repoMetadata: {
      root: params.repoRoot,
      languages: {},
      fileCount: params.changedFiles.length,
      totalLines: 0,
    },
    diff: params.diff,
    context: params.reviewContext.items ?? [],
    diagnostics: roleDiagnostics,
    outputSchema: FINDINGS_OUTPUT_SCHEMA,
  };
}

/**
 * Helper to accumulate token usage across multiple model calls.
 */
function accumulateUsage(total: ModelUsage, add?: ModelUsage): void {
  if (!add) return;
  total.promptTokens += add.promptTokens ?? 0;
  total.completionTokens += add.completionTokens ?? 0;
  total.totalTokens += add.totalTokens ?? 0;
}

/**
 * Checks whether an error was caused by abort cancellation.
 */
function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
  ) {
    return true;
  }
  return false;
}

/**
 * Executes the staged Review DAG runner.
 *
 * @param params - Execution input parameters
 * @returns Combined findings, warnings, triggered reviewer roles, and token usage
 */
export async function executeReviewDAG(params: DAGParams): Promise<DAGResult> {
  const { signal, model } = params;

  // 1. Evaluate reviewer triggers upfront
  const triggeredReviewers: ReviewerRole[] = ['structural'];

  const shouldRunSemantic = shouldTriggerSemanticReviewer({
    diff: params.diff,
    changedFiles: params.changedFiles,
    symbolIndex: params.symbolIndex,
  });
  if (shouldRunSemantic) {
    triggeredReviewers.push('semantic');
  }

  const shouldRunSecurity = shouldTriggerSecurityReviewer({
    diff: params.diff,
    changedFiles: params.changedFiles,
    symbolIndex: params.symbolIndex,
  });
  if (shouldRunSecurity) {
    triggeredReviewers.push('security');
  }

  log.info(
    { triggeredReviewers, changedFilesCount: params.changedFiles.length },
    'Reviewer DAG plan scheduled'
  );

  const findings: ModelFinding[] = [];
  const warnings: string[] = [];
  const failedReviewers: ReviewerRole[] = [];
  const usage: ModelUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  // Concurrency bounded to 2 concurrent model requests
  const pool = createPromisePool(2);

  // 2. Stage 1: Execute Structural Reviewer baseline
  signal?.throwIfAborted();
  try {
    const structuralRequest = buildModelRequest('structural', params);
    const structuralResponse = await pool.run(() => model.generate(structuralRequest));

    for (const finding of structuralResponse.findings) {
      findings.push({
        ...finding,
        reviewer: finding.reviewer || 'structural',
      });
    }
    accumulateUsage(usage, structuralResponse.usage);
    log.info(
      { findingCount: structuralResponse.findings.length },
      'Structural reviewer stage completed'
    );
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw error;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    warnings.push(`[structural] reviewer failed: ${errorMsg}`);
    failedReviewers.push('structural');
    log.warn({ error, reviewer: 'structural' }, 'Structural reviewer failed');
  }

  // Check cancellation before conditional stages
  signal?.throwIfAborted();

  // 3. Stage 2: Execute conditional Semantic and Security reviewers in bounded pool
  const conditionalRoles = triggeredReviewers.filter((role) => role !== 'structural');

  if (conditionalRoles.length > 0) {
    await Promise.all(
      conditionalRoles.map(async (role) => {
        try {
          signal?.throwIfAborted();
          const request = buildModelRequest(role, params);
          const response = await pool.run(() => model.generate(request));

          for (const finding of response.findings) {
            findings.push({
              ...finding,
              reviewer: finding.reviewer || role,
            });
          }
          accumulateUsage(usage, response.usage);
          log.info(
            { role, findingCount: response.findings.length },
            `${role} reviewer stage completed`
          );
        } catch (error) {
          if (isAbortError(error, signal)) {
            throw error;
          }
          const errorMsg = error instanceof Error ? error.message : String(error);
          warnings.push(`[${role}] reviewer failed: ${errorMsg}`);
          failedReviewers.push(role);
          log.warn({ error, reviewer: role }, `${role} reviewer failed`);
        }
      })
    );
  }

  // 4. Fault tolerance check: If ALL triggered reviewers failed, fail-fast
  if (failedReviewers.length === triggeredReviewers.length) {
    const summary = warnings.join('; ');
    throw new ModelError(`All review DAG stages failed: ${summary}`);
  }

  return {
    findings,
    warnings,
    triggeredReviewers,
    usage,
  };
}
