/**
 * Mock utilities and fixture generators for Application Layer testing.
 */

import type { ModelRequest, ModelResponse, ReviewModel } from '../../model/types.js';
import type {
  FindingCategory,
  RankedFinding,
  ReviewResult,
  ReviewSeverity,
} from '../../review/types.js';

/**
 * Creates a valid RankedFinding fixture for testing.
 */
export function createMockFinding(
  severity: ReviewSeverity = 'medium',
  overrides?: Partial<RankedFinding> | undefined
): RankedFinding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 9)}`,
    title: `Sample ${severity} finding`,
    message: `A test finding with severity ${severity}`,
    file: 'src/index.ts',
    startLine: 10,
    endLine: 15,
    severity,
    category: 'correctness',
    confidence: 0.85,
    evidence: [
      {
        file: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        relationship: 'caller',
        explanation: 'Reference site',
      },
    ],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'Potential runtime error',
    suggestedFix: 'Add null check',
    reviewer: 'structural',
    compositeScore: 75,
    scoreBreakdown: {
      severityScore: 80,
      confidenceScore: 85,
      evidenceStrengthScore: 70,
      blastRadiusScore: 50,
      securityImpactScore: 60,
      regressionProbabilityScore: 40,
    },
    blastRadius: 20,
    evidenceStrength: 80,
    contributingReviewers: ['structural'],
    line: 10,
    ...overrides,
  };
}

/**
 * Creates a valid ReviewResult fixture with aggregated summary and metadata.
 */
export function createMockReviewResult(
  findings?: RankedFinding[] | undefined,
  overrides?: Partial<ReviewResult> | undefined
): ReviewResult {
  const finalFindings = findings ?? [];
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

  for (const f of finalFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byReviewer[f.reviewer] = (byReviewer[f.reviewer] ?? 0) + 1;
  }

  return {
    summary: {
      totalFindings: finalFindings.length,
      bySeverity,
      byCategory,
      byReviewer,
      filesAnalyzed: 1,
      durationMs: 150,
      ...overrides?.summary,
    },
    findings: finalFindings,
    metadata: {
      scopeType: 'working-tree',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      model: 'mock-model',
      totalTokens: 500,
      promptTokens: 400,
      completionTokens: 100,
      warnings: [],
      reviewersTriggered: ['structural'],
      criticInvoked: true,
      preCriticFindingCount: finalFindings.length,
      postCriticFindingCount: finalFindings.length,
      ...overrides?.metadata,
    },
    ...overrides,
  };
}

/**
 * In-memory configurable mock ReviewModel for testing Application Layer use cases.
 */
export class MockReviewModel implements ReviewModel {
  public calls: ModelRequest[] = [];
  private handlers: Map<string, (req: ModelRequest) => Promise<ModelResponse>> = new Map();

  /**
   * Registers a handler for requests matching a keyword or role substring.
   */
  public setHandler(keyword: string, handler: (req: ModelRequest) => Promise<ModelResponse>): void {
    this.handlers.set(keyword.toLowerCase(), handler);
  }

  /**
   * Clears recorded calls and handlers.
   */
  public reset(): void {
    this.calls = [];
    this.handlers.clear();
  }

  /**
   * Generates a mock response or runs a matched handler.
   */
  public async generate(request: ModelRequest): Promise<ModelResponse> {
    await Promise.resolve();
    this.calls.push(request);
    const task = request.reviewTask.toLowerCase();
    const firstLine = (request.reviewTask.split('\n')[0] ?? '').toLowerCase();

    for (const [key, handler] of this.handlers.entries()) {
      if (firstLine.includes(key)) {
        return handler(request);
      }
    }

    for (const [key, handler] of this.handlers.entries()) {
      if (task.includes(key)) {
        return handler(request);
      }
    }

    return {
      findings: [],
      usage: {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      },
      model: 'mock-nemotron',
      latencyMs: 5,
      finishReason: 'stop',
    };
  }
}
