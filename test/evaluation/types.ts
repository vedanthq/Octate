/**
 * Authoritative Evaluation Domain Models for Golden Review Benchmark.
 * Supports distinct modes for Harness Integrity (Mock) and Live Pipeline Evaluation (Real LLM).
 */

import type { RankedFinding } from "../../src/review/types.js";

export type EvaluationMode = "harness_mock" | "live_pipeline";

export interface ExpectedFinding {
  id: string;
  category: "security" | "correctness" | "performance" | "architecture" | "reliability" | "testing";
  expectedSeverity: "critical" | "high" | "medium" | "low" | "info";
  targetFile: string;
  lineRange: { start: number; end: number };
  minConfidence: number;
  titleContains?: string | undefined;
  defectKeywords?: string[] | undefined;
  negativeVariantFile?: string | undefined;
  expectedNegativeFindings: number;
  hasDefect?: boolean | undefined;
}

export interface GoldenFixture {
  name: string;
  category: string;
  language: "typescript" | "python" | "markdown" | "other";
  baselineFile?: string | undefined;
  baselineContent?: string | undefined;
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
  language: "typescript" | "python" | "markdown" | "other";
  mode: EvaluationMode;
  provider: string;
  model: string;
  endpoint?: string | undefined;
  detectedExpected: boolean;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
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
  requestCount: number;
  apiFailures: number;
  timeoutCount: number;
  byReviewer: Record<string, number>;
  reviewerSpecificFindings: Record<string, RankedFinding[]>;
  criticRetainedCount: number;
  vulnerableDiffLines: number;
  cleanDiffLines: number;
  passed: boolean;
}

export interface EvaluationScorecard {
  mode: EvaluationMode;
  modeLabel: string;
  provider: string;
  modelName: string;
  endpoint: string;
  totalRequests: number;
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
  timeoutCount: number;
  passed: boolean;
  disclaimer?: string | undefined;
  results: EvaluationResult[];
  rawResults: EvaluationResult[];
}
