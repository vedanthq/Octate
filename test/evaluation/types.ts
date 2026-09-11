/**
 * Authoritative Evaluation Domain Models for Golden Review Benchmark.
 */

import type { RankedFinding } from '../../src/review/types.js';

export interface ExpectedFinding {
  id: string;
  category: 'security' | 'correctness' | 'performance' | 'architecture' | 'reliability';
  expectedSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  targetFile: string;
  lineRange: { start: number; end: number };
  minConfidence: number;
  titleContains?: string | undefined;
  negativeVariantFile?: string | undefined;
  expectedNegativeFindings: number;
}

export interface GoldenFixture {
  name: string;
  category: string;
  language: 'typescript' | 'python';
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
  detectedExpected: boolean;
  actualFindings: number;
  expectedFindings: number;
  negativeFindings: number;
  passed: boolean;
  latencyMs: number;
  matchedFindings: RankedFinding[];
  unmatchedFindings: RankedFinding[];
}

export interface EvaluationScorecard {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  falsePositiveRate: number;
  latencyMs: number;
  passed: boolean;
  results: EvaluationResult[];
}
