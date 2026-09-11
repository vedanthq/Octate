/**
 * Golden Review Evaluation Test Suite.
 * Asserts precision > 70% and false-positive rate < 30% across
 * TypeScript and Python defect fixtures.
 */

import { describe, expect, it } from '@jest/globals';
import { loadGoldenFixtures, matchesExpected, runEvaluationHarness } from './harness.js';
import type { EvaluationScorecard } from './types.js';

describe('Golden Review Evaluation Testbed', () => {
  it('loads all 4 golden fixtures across categories and languages', async () => {
    const fixtures = await loadGoldenFixtures();
    expect(fixtures.length).toBe(4);

    const names = fixtures.map((f) => f.name);
    expect(names).toContain('security/sql-injection');
    expect(names).toContain('security/command-injection');
    expect(names).toContain('structural/resource-leak');
    expect(names).toContain('semantic/logic-regression');

    const languages = fixtures.map((f) => f.language);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
  });

  describe('matchesExpected multi-factor assertion', () => {
    const expected = {
      id: 'test-rule',
      category: 'security' as const,
      expectedSeverity: 'critical' as const,
      targetFile: 'src/db/users.ts',
      lineRange: { start: 10, end: 15 },
      minConfidence: 0.8,
      expectedNegativeFindings: 0,
    };

    it('matches when line, file, category, severity, and confidence criteria align', () => {
      const finding = {
        id: 'mock-1',
        title: 'SQL injection',
        message: 'Direct interpolation in SQL query',
        file: 'src/db/users.ts',
        startLine: 12,
        endLine: 14,
        severity: 'critical' as const,
        category: 'security' as const,
        confidence: 0.9,
        compositeScore: 90,
        blastRadius: 80,
        evidenceStrength: 85,
        scoreBreakdown: {
          severityScore: 90,
          confidenceScore: 90,
          evidenceStrengthScore: 85,
          blastRadiusScore: 80,
          securityImpactScore: 95,
          regressionProbabilityScore: 80,
        },
        contributingReviewers: ['security'],
        evidence: [],
      };

      expect(matchesExpected(finding, expected)).toBe(true);
    });

    it('rejects finding with lower severity than expected', () => {
      const finding = {
        id: 'mock-2',
        title: 'Minor issue',
        message: 'Low severity note',
        file: 'src/db/users.ts',
        startLine: 12,
        endLine: 14,
        severity: 'low' as const,
        category: 'security' as const,
        confidence: 0.9,
        compositeScore: 40,
        blastRadius: 20,
        evidenceStrength: 50,
        scoreBreakdown: {
          severityScore: 30,
          confidenceScore: 90,
          evidenceStrengthScore: 50,
          blastRadiusScore: 20,
          securityImpactScore: 30,
          regressionProbabilityScore: 20,
        },
        contributingReviewers: ['security'],
        evidence: [],
      };

      expect(matchesExpected(finding, expected)).toBe(false);
    });

    it('rejects finding when lines do not overlap within +/- 3 lines tolerance', () => {
      const finding = {
        id: 'mock-3',
        title: 'Different line issue',
        message: 'Far away code line',
        file: 'src/db/users.ts',
        startLine: 100,
        endLine: 105,
        severity: 'critical' as const,
        category: 'security' as const,
        confidence: 0.9,
        compositeScore: 90,
        blastRadius: 80,
        evidenceStrength: 85,
        scoreBreakdown: {
          severityScore: 90,
          confidenceScore: 90,
          evidenceStrengthScore: 85,
          blastRadiusScore: 80,
          securityImpactScore: 95,
          regressionProbabilityScore: 80,
        },
        contributingReviewers: ['security'],
        evidence: [],
      };

      expect(matchesExpected(finding, expected)).toBe(false);
    });
  });

  describe('runEvaluationHarness execution', () => {
    let scorecard: EvaluationScorecard;

    it('executes full evaluation pipeline against all fixtures', async () => {
      scorecard = await runEvaluationHarness();
      expect(scorecard).toBeDefined();
      expect(scorecard.results).toHaveLength(4);
    }, 60000);

    it('verifies individual fixtures detect defect and suppress clean false-positives', () => {
      for (const res of scorecard.results) {
        expect(res.detectedExpected).toBe(true);
        expect(res.negativeFindings).toBe(0);
        expect(res.passed).toBe(true);
      }
    });

    it('verifies scorecard.precision exceeds 70% target (D-04)', () => {
      expect(scorecard.precision).toBeGreaterThanOrEqual(0.7);
      expect(scorecard.truePositives).toBe(4);
      expect(scorecard.falseNegatives).toBe(0);
    });

    it('verifies scorecard.falsePositiveRate is below 30% target (D-04)', () => {
      expect(scorecard.falsePositiveRate).toBeLessThanOrEqual(0.3);
      expect(scorecard.falsePositives).toBe(0);
    });

    it('verifies total latency is within acceptable threshold', () => {
      expect(scorecard.latencyMs).toBeLessThan(30000);
      expect(scorecard.passed).toBe(true);
    });
  });
});
