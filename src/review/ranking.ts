/**
 * Confidence-Weighted Composite Ranking Engine & Critical-Protected Truncation.
 *
 * Implements:
 * 1. Normalized 0-100 composite scoring formula (D-13):
 *    CompositeScore = 0.30 * S + 0.20 * C + 0.15 * E + 0.15 * B + 0.10 * SI + 0.10 * RP
 * 2. Deterministic Blast Radius derived from ReferenceGraph callers & importers (D-14).
 * 3. Evidence Strength derived from count, file diversity, and line span specificity.
 * 4. Pre-ranking severity filtering (minSeverity).
 * 5. Critical-Protected Truncation (D-15): Critical findings are NEVER truncated.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ReferenceGraph } from '../intelligence/graph/reference.js';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ModelFinding } from '../model/types.js';
import type { FindingCategory, RankedFinding, ReviewSeverity, ScoreBreakdown } from './types.js';

const SEVERITY_SCORES: Record<ReviewSeverity, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  info: 10,
};

const SEVERITY_LEVELS: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const CATEGORY_REGRESSION_BASE: Record<FindingCategory, number> = {
  correctness: 85,
  reliability: 80,
  compatibility: 70,
  performance: 50,
  architecture: 40,
  maintainability: 30,
  testing: 20,
  security: 30,
};

const SECURITY_KEYWORD_REGEX =
  /\b(cve|injection|vulnerability|sqli|xss|rce|traversal|csrf|ssrf)\b/i;

/**
 * Calculates severity component score (0-100).
 */
export function calculateSeverityScore(severity: ReviewSeverity): number {
  return SEVERITY_SCORES[severity] ?? 10;
}

/**
 * Calculates confidence component score clamped to 0-100.
 */
export function calculateConfidenceScore(confidence: number): number {
  return Math.min(100, Math.max(0, Math.round(confidence * 100)));
}

/**
 * Calculates evidence strength score based on quantity, diversity, and specificity (D-14).
 */
export function calculateEvidenceStrength(finding: ModelFinding): number {
  const evidence = finding.evidence;
  if (!evidence || evidence.length === 0) {
    return 0;
  }

  // Base score by count
  let base = 0;
  const count = evidence.length;
  if (count === 1) {
    base = 40;
  } else if (count === 2) {
    base = 70;
  } else if (count >= 3) {
    base = 90;
  }

  // Diversity bonus (+10): if evidence items span >= 2 distinct files
  let diversityBonus = 0;
  const uniqueFiles = new Set(evidence.map((item) => path.normalize(item.file)));
  if (uniqueFiles.size >= 2) {
    diversityBonus = 10;
  }

  // Specificity bonus (+5): if all evidence items have line spans <= 10 lines
  let specificityBonus = 0;
  const allTight = evidence.every((item) => {
    const end = item.endLine ?? item.startLine;
    const span = Math.max(1, end - item.startLine + 1);
    return span <= 10;
  });
  if (allTight) {
    specificityBonus = 5;
  }

  return Math.min(100, Math.max(0, base + diversityBonus + specificityBonus));
}

/**
 * Calculates blast radius deterministically from ReferenceGraph callers and file importers (D-14).
 * Formula: B = min(100, round(10 + 90 * min(1.0, log2(N + 1) / 4)))
 */
export function calculateBlastRadius(
  finding: ModelFinding,
  referenceGraph: ReferenceGraph,
  symbolIndex?: SymbolIndex
): number {
  let callersCount = 0;
  const normFile = path.normalize(finding.file);

  // 1. Resolve enclosing symbol callers via symbolIndex
  if (symbolIndex) {
    const fileSymbols = symbolIndex.getFileSymbols(normFile);
    let innermost: { id: string; span: number } | null = null;

    for (const sym of fileSymbols) {
      if (
        sym.range &&
        sym.range.startLine <= finding.startLine &&
        sym.range.endLine >= finding.startLine
      ) {
        const span = sym.range.endLine - sym.range.startLine;
        if (!innermost || span < innermost.span) {
          innermost = { id: sym.id, span };
        }
      }
    }

    if (innermost) {
      const callers = referenceGraph.getCallers(innermost.id);
      callersCount = callers.length;
    }
  }

  // 2. Fallback: query callers for any matching symbol in relatedSymbols
  if (callersCount === 0 && finding.relatedSymbols && finding.relatedSymbols.length > 0) {
    for (const symId of finding.relatedSymbols) {
      const callers = referenceGraph.getCallers(symId);
      if (callers.length > 0) {
        callersCount = Math.max(callersCount, callers.length);
      }
    }
  }

  // 3. Query file importers via incoming edges with kind 'imports' or 'imported_by'
  const incoming = referenceGraph.getIncoming(normFile);
  const importers = incoming.filter((e) => e.kind === 'imports' || e.kind === 'imported_by');
  const importersCount = importers.length;

  const totalDependents = callersCount + importersCount;

  // Logarithmic scaling: N=0 -> 10, N=1 -> 33, N=3 -> 55, N=7 -> 78, N>=15 -> 100
  const blastRadius = Math.min(
    100,
    Math.round(10 + 90 * Math.min(1.0, Math.log2(totalDependents + 1) / 4))
  );

  return blastRadius;
}

/**
 * Calculates security impact score (0-100).
 */
export function calculateSecurityImpact(finding: ModelFinding): number {
  if (finding.category === 'security') {
    switch (finding.severity) {
      case 'critical':
        return 100;
      case 'high':
        return 85;
      case 'medium':
        return 60;
      case 'low':
        return 40;
      case 'info':
        return 20;
    }
  }

  // Check if title or message matches security keywords
  const text = `${finding.title} ${finding.message}`;
  if (SECURITY_KEYWORD_REGEX.test(text)) {
    return 15;
  }

  return 0;
}

/**
 * Calculates regression probability score based on defect category and coupling (0-100).
 */
export function calculateRegressionProbability(finding: ModelFinding, blastRadius: number): number {
  const base = CATEGORY_REGRESSION_BASE[finding.category] ?? 30;
  const couplingBonus = blastRadius >= 50 ? 15 : 0;
  return Math.min(100, Math.max(0, base + couplingBonus));
}

/**
 * Calculates normalized 0-100 composite score with full component breakdown (D-13).
 */
export function calculateCompositeScore(
  finding: ModelFinding,
  referenceGraph: ReferenceGraph,
  symbolIndex?: SymbolIndex
): {
  compositeScore: number;
  scoreBreakdown: ScoreBreakdown;
  blastRadius: number;
  evidenceStrength: number;
} {
  const severityScore = calculateSeverityScore(finding.severity);
  const confidenceScore = calculateConfidenceScore(finding.confidence);
  const evidenceStrengthScore = calculateEvidenceStrength(finding);
  const blastRadiusScore = calculateBlastRadius(finding, referenceGraph, symbolIndex);
  const securityImpactScore = calculateSecurityImpact(finding);
  const regressionProbabilityScore = calculateRegressionProbability(finding, blastRadiusScore);

  // biome-ignore format: preserve exact decimal notation
  const rawScore =
    0.30 * severityScore +
    0.20 * confidenceScore +
    0.15 * evidenceStrengthScore +
    0.15 * blastRadiusScore +
    0.10 * securityImpactScore +
    0.10 * regressionProbabilityScore;

  const compositeScore = Math.round(rawScore * 100) / 100;

  const scoreBreakdown: ScoreBreakdown = {
    severityScore,
    confidenceScore,
    evidenceStrengthScore,
    blastRadiusScore,
    securityImpactScore,
    regressionProbabilityScore,
  };

  return {
    compositeScore,
    scoreBreakdown,
    blastRadius: blastRadiusScore,
    evidenceStrength: evidenceStrengthScore,
  };
}

/**
 * Comparator for deterministic ranking order:
 * 1. compositeScore descending
 * 2. severity level descending
 * 3. confidence descending
 * 4. file ascending
 * 5. startLine ascending
 */
function compareRankedFindings(a: RankedFinding, b: RankedFinding): number {
  if (Math.abs(b.compositeScore - a.compositeScore) > 0.0001) {
    return b.compositeScore - a.compositeScore;
  }
  const sevDiff = (SEVERITY_LEVELS[b.severity] ?? 0) - (SEVERITY_LEVELS[a.severity] ?? 0);
  if (sevDiff !== 0) {
    return sevDiff;
  }
  if (Math.abs(b.confidence - a.confidence) > 0.0001) {
    return b.confidence - a.confidence;
  }
  const fileDiff = a.file.localeCompare(b.file);
  if (fileDiff !== 0) {
    return fileDiff;
  }
  return a.startLine - b.startLine;
}

/**
 * Parameters for ranking and truncation.
 */
export interface RankingParams {
  findings: ModelFinding[];
  referenceGraph: ReferenceGraph;
  symbolIndex?: SymbolIndex;
  minSeverity?: ReviewSeverity | undefined;
  maxFindings?: number | undefined;
}

/**
 * Filters findings below minSeverity, computes composite scores, sorts, and applies
 * Critical-Protected Truncation (D-15).
 */
export function rankAndTruncateFindings(params: RankingParams): RankedFinding[] {
  const { findings, referenceGraph, symbolIndex, minSeverity, maxFindings = 50 } = params;

  // 1. Filter out findings below minSeverity
  const minLevel = minSeverity ? SEVERITY_LEVELS[minSeverity] : 1;
  const eligibleFindings = findings.filter((f) => (SEVERITY_LEVELS[f.severity] ?? 1) >= minLevel);

  // 2. Score and enrich findings
  const rankedList: RankedFinding[] = eligibleFindings.map((f) => {
    const { compositeScore, scoreBreakdown, blastRadius, evidenceStrength } =
      calculateCompositeScore(f, referenceGraph, symbolIndex);

    const hashInput = `${f.file}:${f.startLine}:${f.category}:${f.title}`;
    const id = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

    const contributingReviewers =
      (f as { contributingReviewers?: string[] }).contributingReviewers ??
      (f.reviewer ? [f.reviewer] : ['reviewer']);

    return {
      ...f,
      id,
      compositeScore,
      scoreBreakdown,
      blastRadius,
      evidenceStrength,
      contributingReviewers,
      line: f.startLine,
    };
  });

  // 3. Sort all ranked findings
  rankedList.sort(compareRankedFindings);

  // 4. Critical-Protected Truncation (D-15)
  // Findings with severity === 'critical' are unconditionally preserved
  const criticalList = rankedList.filter((f) => f.severity === 'critical');
  const nonCriticalList = rankedList.filter((f) => f.severity !== 'critical');

  const availableSlots = Math.max(0, maxFindings - criticalList.length);
  const finalNonCritical = nonCriticalList.slice(0, availableSlots);

  const combined = [...criticalList, ...finalNonCritical];
  combined.sort(compareRankedFindings);

  return combined;
}
