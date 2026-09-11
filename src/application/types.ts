/**
 * Authoritative Layer 6 Application Layer domain models and orchestration contracts.
 */

import type { OctateConfig } from '../config/schema.js';
import type { ReviewModel } from '../model/types.js';
import type { ScopeOptions } from '../repository/scope.js';
import type { ReviewSeverity } from '../review/types.js';

/**
 * 8 canonical review stages in chronological execution order.
 */
export type CanonicalReviewStage =
  | 'git:read'
  | 'index:update'
  | 'symbols:resolve'
  | 'diagnostics:collect'
  | 'context:build'
  | 'review:dag'
  | 'review:critic'
  | 'review:rank';

/**
 * Progress status lifecycle states.
 */
export type ReviewProgressStatus = 'start' | 'progress' | 'complete' | 'error';

/**
 * Step progress counter (e.g. current 1 of 8).
 */
export interface ReviewProgressStep {
  current: number;
  total: number;
}

/**
 * Strongly-typed progress event emitted during review pipeline execution.
 */
export interface ReviewProgressEvent {
  stage: CanonicalReviewStage;
  status: ReviewProgressStatus;
  message: string;
  step?: ReviewProgressStep | undefined;
  payload?: Record<string, unknown> | undefined;
}

/**
 * Callback signature for consumer progress subscribers.
 */
export type ReviewProgressCallback = (event: ReviewProgressEvent) => void;

/**
 * Severity threshold for blocking exit code calculation.
 * 'none' or 'off' disables blocking (advisory mode).
 */
export type ReviewFailOnSeverity = ReviewSeverity | 'none' | 'off';

/**
 * Options passed to the ReviewUseCase orchestrator.
 */
export interface ReviewUseCaseOptions {
  repoRoot?: string | undefined;
  scopeOptions?: ScopeOptions | undefined;
  refs?: string[] | undefined;
  config?: OctateConfig | undefined;
  modelOverride?: ReviewModel | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ReviewProgressCallback | undefined;
}

/**
 * Standardized review command exit codes per OUT-02.
 */
export const ReviewExitCodes = {
  SUCCESS: 0,
  BLOCKING_FINDINGS: 1,
  CONFIG_ERROR: 2,
  REPOSITORY_ERROR: 3,
  MODEL_ERROR: 4,
  INTERNAL_ERROR: 5,
  CANCELLED: 130,
} as const;

export type ReviewExitCode = (typeof ReviewExitCodes)[keyof typeof ReviewExitCodes];
