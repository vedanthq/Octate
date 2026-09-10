/**
 * Authoritative Layer 5 Review Engine domain models and input contracts.
 */

import type { ReviewConfig } from '../config/schema.js';
import type { ReferenceGraph } from '../intelligence/graph/reference.js';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ReviewContext } from '../intelligence/types.js';
import type { Diagnostic, ModelFinding, ReviewModel } from '../model/types.js';

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'reliability'
  | 'maintainability'
  | 'compatibility'
  | 'testing';

/**
 * Breakdown of individual scoring dimensions contributing to composite score.
 */
export interface ScoreBreakdown {
  severityScore: number;
  confidenceScore: number;
  evidenceStrengthScore: number;
  blastRadiusScore: number;
  securityImpactScore: number;
  regressionProbabilityScore: number;
}

/**
 * Enriched finding with composite confidence-weighted score, blast radius,
 * and reviewer attribution.
 */
export interface RankedFinding extends ModelFinding {
  /** Deterministic SHA256 identifier (file:startLine:category:title) */
  id: string;
  /** Composite score (0.00 to 100.00) */
  compositeScore: number;
  /** Component scoring breakdown */
  scoreBreakdown: ScoreBreakdown;
  /** Deterministic blast radius (10 to 100) */
  blastRadius: number;
  /** Evidence strength (0 to 100) */
  evidenceStrength: number;
  /** Reviewers that contributed to this finding */
  contributingReviewers: string[];
  /** Compatibility alias for startLine */
  line?: number;
}

/**
 * High-level summary metrics for the review run.
 */
export interface ReviewSummary {
  totalFindings: number;
  bySeverity: Record<ReviewSeverity, number>;
  byCategory: Record<FindingCategory, number>;
  byReviewer: Record<string, number>;
  filesAnalyzed: number;
  durationMs: number;
}

/**
 * Telemetry and provenance metadata for the review execution.
 */
export interface ExecutionMetadata {
  scopeType: string;
  base?: string | undefined;
  head?: string | undefined;
  timestamp: string;
  version: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  warnings: string[];
  reviewersTriggered: string[];
  criticInvoked: boolean;
  preCriticFindingCount: number;
  postCriticFindingCount: number;
}

/**
 * Authoritative review result emitted by the Layer 5 Review Engine.
 */
export interface ReviewResult {
  summary: ReviewSummary;
  findings: RankedFinding[];
  metadata: ExecutionMetadata;
}

/**
 * Input arguments required to execute the Review Engine.
 */
export interface ReviewEngineInput {
  repoRoot: string;
  diff: string;
  changedFiles: string[];
  reviewContext: ReviewContext;
  referenceGraph: ReferenceGraph;
  symbolIndex: SymbolIndex;
  diagnostics: Diagnostic[];
  model: ReviewModel;
  config?: ReviewConfig | undefined;
  signal?: AbortSignal | undefined;
  scopeMetadata?:
    | {
        scopeType: string;
        base?: string | undefined;
        head?: string | undefined;
      }
    | undefined;
}
