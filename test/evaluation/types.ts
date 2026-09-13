/**
 * Authoritative Evaluation Domain Models for Golden Review Benchmark.
 * Supports distinct modes for Harness Integrity (Mock) and Live Pipeline Evaluation (Real LLM).
 */

import type { RankedFinding } from '../../src/review/types.js';

export type EvaluationMode = 'harness_mock' | 'live_pipeline';

export interface ExpectedFinding {
  id: string;
  category: 'security' | 'correctness' | 'performance' | 'architecture' | 'reliability' | 'testing';
  expectedSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  targetFile: string;
  lineRange: { start: number; end: number };
  minConfidence: number;
  titleContains?: string | undefined;
  negativeVariantFile?: string | undefined;
  expectedNegativeFindings: number;
  hasDefect?: boolean | undefined;
}

export interface GoldenFixture {
  name: string;
  category: string;
  language: 'typescript' | 'python' | 'markdown' | 'other';
  vulnerableFile: string;
  vulnerableContent: string;
  cleanFile: string;
  cleanContent: string;
  diff: string;
  cleanDiff: string;
  expected: ExpectedFinding;
}

export interface EvaluationResult {
  fixtureName: string;
  category: string;
  language: 'typescript' | 'python' | 'markdown' | 'other';
  mode: EvaluationMode;
  model: string;
  detectedExpected: boolean;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  vulnerableFindings: RankedFinding[];
  cleanFindings: RankedFinding[];
  matchedFindings: RankedFinding[];
  unmatchedFindings: RankedFinding[];
  rawFindingsCount: number;
  actualFindings: number;
  expectedFindings: number;
  negativeFindings: number;
  latencyMs: number;
  vulnerableLatencyMs: number;
  cleanLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  apiFailures: number;
  passed: boolean;
}

export interface EvaluationScorecard {
  mode: EvaluationMode;
  modeLabel: string;
  modelName: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  latencyMs: number;
  apiFailures: number;
  passed: boolean;
  disclaimer?: string;
  results: EvaluationResult[];
}
