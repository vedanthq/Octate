/**
 * Two-Stage Critic Quality Gate.
 *
 * Implements:
 * 1. Stage 3A: Deterministic Hard Floor (D-05, D-06, D-08):
 *    - Repository grounding (file exists, valid lines, no traversal)
 *    - Direct evidence anchor verification (>= 1 verified anchor)
 *    - Configurable confidence threshold (confidence >= minConfidence ?? 0.6)
 *    - Concrete actionability check (suggestedFix >= 15 chars, no generic placeholders)
 *    - Intentionality and test mock filter
 * 2. Stage 3B: LLM Critic Quality Gate (D-07):
 *    - Skips LLM call completely if 0 candidates pass Stage 3A
 *    - Invokes critic.v1 model prompt with candidate findings
 *    - Resilient schema repair retry on invalid output
 *    - Fail-fast with ModelError (exit code 4) if Critic quality gate fails after retry
 */

import { ModelError } from '../errors/index.js';
import type { ReviewContext } from '../intelligence/types.js';
import { createLogger } from '../logging/index.js';
import { FINDINGS_OUTPUT_SCHEMA } from '../model/index.js';
import { type GroundingContext, groundFinding } from '../model/schema/grounding.js';
import type {
  Diagnostic,
  ModelFinding,
  ModelRequest,
  ModelResponse,
  ModelUsage,
  ReviewModel,
} from '../model/types.js';
import { isDeliberateIntentOrMock } from './heuristics.js';

const log = createLogger('review/critic');

const GENERIC_FIX_PATTERNS = [
  'todo',
  'fix this',
  'be careful',
  'n/a',
  'none',
  'not applicable',
  'tbd',
  'fix it',
  'please fix',
];

/**
 * Checks whether a suggested fix provides concrete, non-trivial remediation (D-08).
 * Rejects fixes shorter than 15 characters or matching generic placeholders.
 */
export function isActionableFix(fix: string | undefined): boolean {
  if (!fix) return false;
  const trimmed = fix.trim();
  if (trimmed.length < 15) return false;

  const lower = trimmed.toLowerCase();
  for (const pattern of GENERIC_FIX_PATTERNS) {
    if (
      lower === pattern ||
      lower.startsWith(`${pattern}:`) ||
      lower.startsWith(`${pattern} `) ||
      lower.startsWith(`${pattern}-`) ||
      lower.startsWith(`${pattern} -`) ||
      lower.startsWith(`${pattern}.`)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Input parameters for Stage 3A: Deterministic Hard Floor.
 */
export interface HardFloorParams {
  findings: ModelFinding[];
  repoRoot: string;
  minConfidence?: number | undefined;
  diff?: string | undefined;
  getFileLineCount?: ((file: string) => Promise<number | null>) | undefined;
  validFiles?: Set<string> | undefined;
}

/**
 * Input parameters for Stage 3B: Critic Quality Gate Execution.
 */
export interface CriticParams {
  findings: ModelFinding[];
  repoRoot: string;
  diff: string;
  reviewContext: ReviewContext;
  diagnostics: Diagnostic[];
  model: ReviewModel;
  minConfidence?: number | undefined;
  getFileLineCount?: ((file: string) => Promise<number | null>) | undefined;
  validFiles?: Set<string> | undefined;
  projectRules?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Result of executing the Critic stage.
 */
export interface CriticResult {
  findings: ModelFinding[];
  criticInvoked: boolean;
  usage: ModelUsage;
}

/**
 * Stage 3A: Applies deterministic filters to eliminate invalid, ungrounded,
 * low-confidence, evidenceless, and non-actionable findings before invoking LLM Critic (D-05, D-06).
 */
export async function filterDeterministicHardFloor(
  params: HardFloorParams
): Promise<ModelFinding[]> {
  const { findings, repoRoot, minConfidence = 0.6, diff, getFileLineCount, validFiles } = params;
  const filtered: ModelFinding[] = [];

  const groundingCtx: GroundingContext = {
    repoRoot,
    ...(getFileLineCount ? { getFileLineCount } : {}),
    ...(validFiles ? { validFiles } : {}),
  };

  for (const finding of findings) {
    // 1. Confidence floor check (D-06)
    if (finding.confidence < minConfidence) {
      continue;
    }

    // 2. Direct evidence anchor check (D-06): must have at least 1 evidence item
    if (!finding.evidence || finding.evidence.length === 0) {
      continue;
    }

    // 3. Concrete actionability check (D-08)
    if (!isActionableFix(finding.suggestedFix)) {
      continue;
    }

    // 4. Intentionality / test mock filter (D-08)
    if (isDeliberateIntentOrMock({ finding, diff, repoRoot })) {
      continue;
    }

    // 5. Repository grounding check via groundFinding
    const grounded = await groundFinding(finding, groundingCtx);

    if (!grounded) {
      continue;
    }

    // Surviving finding must have at least 1 verified evidence item
    if (!grounded.evidence || grounded.evidence.length === 0) {
      continue;
    }

    filtered.push(grounded);
  }

  return filtered;
}

/**
 * Accumulates token usage across multiple model calls.
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
 * Stage 3B: Executes the Two-Stage Critic Quality Gate pipeline.
 *
 * 1. Filters candidate findings through deterministic Stage 3A hard floor.
 * 2. If 0 candidates survive, skips Critic LLM call completely (0 tokens, 0 latency).
 * 3. Otherwise, invokes critic.v1 model prompt with candidate findings.
 * 4. On failure or schema invalidity, performs 1 schema-repaired retry.
 * 5. If retry fails, fails fast by throwing ModelError (exit code 4).
 *
 * @param params - Critic execution parameters
 * @returns Curated findings, whether Critic was invoked, and token usage
 */
export async function executeCriticStage(params: CriticParams): Promise<CriticResult> {
  const { signal } = params;

  // 1. Stage 3A: Deterministic Hard Floor
  const candidateFindings = await filterDeterministicHardFloor({
    findings: params.findings,
    repoRoot: params.repoRoot,
    diff: params.diff,
    ...(params.minConfidence !== undefined ? { minConfidence: params.minConfidence } : {}),
    ...(params.getFileLineCount ? { getFileLineCount: params.getFileLineCount } : {}),
    ...(params.validFiles ? { validFiles: params.validFiles } : {}),
  });

  // 2. Optimization: Skip Critic LLM call completely when zero findings pass Stage 3A
  if (candidateFindings.length === 0) {
    log.info('Zero candidate findings survived deterministic hard floor; skipping Critic LLM call');
    return {
      findings: [],
      criticInvoked: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  signal?.throwIfAborted();

  // 3. Stage 3B: Build Critic Model Request
  const criticRequest: ModelRequest = {
    systemPolicy:
      'Act as a Senior Staff Critic: review, filter, and curate candidate findings to eliminate false positives, hallucinated lines, and ungrounded issues.',
    reviewTask:
      'Senior Staff Critic: review, filter, and curate candidate findings:\n' +
      JSON.stringify(candidateFindings, null, 2),
    projectRules: params.projectRules ?? [],
    repoMetadata: {
      root: params.repoRoot,
      languages: {},
      fileCount: 0,
      totalLines: 0,
    },
    diff: params.diff,
    context: params.reviewContext.items ?? [],
    diagnostics: params.diagnostics,
    outputSchema: FINDINGS_OUTPUT_SCHEMA,
  };

  const usage: ModelUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  let criticResponse: ModelResponse;

  // 4. Model Call with Failure Resilience & Quality Gate Retry (D-07)
  try {
    signal?.throwIfAborted();
    criticResponse = await params.model.generate(criticRequest);
    accumulateUsage(usage, criticResponse.usage);
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw error;
    }

    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Critic invocation failed, attempting schema repair retry'
    );

    // Attempt one immediate retry with explicit repair instructions
    try {
      signal?.throwIfAborted();
      const retryRequest: ModelRequest = {
        ...criticRequest,
        reviewTask:
          criticRequest.reviewTask +
          '\n\nCRITICAL RETRY INSTRUCTION: The previous output failed validation. You must respond strictly with valid JSON conforming to the findings schema: an array of findings with severity, category, title, message, file, startLine, endLine, confidence, evidence, impact, suggestedFix, reviewer.',
      };
      criticResponse = await params.model.generate(retryRequest);
      accumulateUsage(usage, criticResponse.usage);
    } catch (retryError) {
      if (isAbortError(retryError, signal)) {
        throw retryError;
      }

      const errorMsg = retryError instanceof Error ? retryError.message : String(retryError);
      log.error({ retryError }, 'Critic quality gate failed after retry');

      // Fail-fast with ModelError (exit code 4) to ensure unverified findings never reach the user
      throw new ModelError('Critic quality gate failed to validate findings', {
        error: errorMsg,
      });
    }
  }

  signal?.throwIfAborted();

  const curatedFindings = criticResponse.findings.map((finding) => ({
    ...finding,
    reviewer: finding.reviewer || 'critic',
  }));

  log.info(
    {
      candidateCount: candidateFindings.length,
      curatedCount: curatedFindings.length,
    },
    'Critic quality gate stage completed successfully'
  );

  return {
    findings: curatedFindings,
    criticInvoked: true,
    usage,
  };
}
