/**
 * Severity threshold evaluation, blocking finding calculation, and failure banner formatting.
 * Implements OUT-02 exit code gating and D-01, D-02, D-03, D-04 policy requirements.
 */

import pc from 'picocolors';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';
import type { ReviewFailOnSeverity } from './types.js';

/**
 * Numeric severity rank mapping: critical (5) down to info (1).
 */
export const SEVERITY_LEVELS: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Determines whether a finding meets or exceeds the given severity threshold.
 * If threshold is 'none' or 'off' (advisory mode), always returns false.
 *
 * @param finding - The ranked finding to evaluate
 * @param threshold - The severity threshold ('critical' | 'high' | 'medium' | 'low' | 'info' | 'none' | 'off')
 * @returns boolean indicating if the finding is blocking
 */
export function isBlockingFinding(
  finding: RankedFinding,
  threshold: ReviewFailOnSeverity
): boolean {
  if (threshold === 'none' || threshold === 'off') {
    return false;
  }
  const findingLevel = SEVERITY_LEVELS[finding.severity] ?? 0;
  const thresholdLevel = SEVERITY_LEVELS[threshold] ?? 5;
  return findingLevel >= thresholdLevel;
}

/**
 * Counts the number of blocking findings in a list against a severity threshold.
 *
 * @param findings - Array of ranked findings
 * @param threshold - The severity threshold
 * @returns Count of findings meeting or exceeding the threshold
 */
export function countBlockingFindings(
  findings: RankedFinding[],
  threshold: ReviewFailOnSeverity
): number {
  if (threshold === 'none' || threshold === 'off') {
    return 0;
  }
  return findings.filter((f) => isBlockingFinding(f, threshold)).length;
}

/**
 * Evaluates the exit code (0 for success/advisory, 1 for blocking findings)
 * based on review result findings and configured threshold.
 *
 * @param result - Authoritative ReviewResult
 * @param threshold - Configured failure threshold (defaults to 'critical')
 * @returns 0 if passed or advisory mode, 1 if any blocking findings exist
 */
export function evaluateExitCode(
  result: ReviewResult,
  threshold: ReviewFailOnSeverity = 'critical'
): 0 | 1 {
  const blockingCount = countBlockingFindings(result.findings, threshold);
  return blockingCount > 0 ? 1 : 0;
}

/**
 * Formats a terminal failure banner to stderr when exit code is 1.
 *
 * @param blockingCount - Number of blocking findings detected
 * @param threshold - The severity threshold that was triggered
 * @returns Colorized red failure message string
 */
export function formatFailureBanner(
  blockingCount: number,
  threshold: ReviewFailOnSeverity
): string {
  const noun = blockingCount === 1 ? 'blocking finding' : 'blocking findings';
  return pc.red(`\n❌ Review failed: ${blockingCount} ${noun} (>= ${threshold})\n`);
}
