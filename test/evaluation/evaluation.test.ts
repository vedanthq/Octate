/**
 * Golden Review Evaluation Test Suite.
 * Asserts harness integrity and verifies that live pipeline mode enforces strict non-mock invariants.
 */

import { describe, expect, it } from '@jest/globals';
import { MockReviewModel } from '../../src/review/__tests__/mocks.js';
import { loadGoldenFixtures, matchesExpected, runEvaluationHarness } from './harness.js';
import type { EvaluationScorecard } from './types.js';

describe('Golden Review Evaluation Testbed', () => {
  it('loads all golden fixtures across categories and languages', async () => {
    const fixtures = await loadGoldenFixtures();
    expect(fixtures.length).toBe(8);

    const names = fixtures.map((f) => f.name);
    expect(names).toContain('security/sql-injection');
    expect(names).toContain('security/command-injection');
    expect(names).toContain('security/sql-clean-type-assertion');
    expect(names).toContain('structural/resource-leak');
    expect(names).toContain('semantic/logic-regression');
    expect(names).toContain('refactor/unrelated-refactor');
    expect(names).toContain('docs/documentation-only');
    expect(names).toContain('test/test-only');

    const languages = fixtures.map((f) => f.language);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('markdown');
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

  describe('Harness Integrity Mode Execution (Mocks)', () => {
    let scorecard: EvaluationScorecard;

    it('executes harness integrity pipeline against all fixtures', async () => {
      scorecard = await runEvaluationHarness();
      expect(scorecard).toBeDefined();
      expect(scorecard.mode).toBe('harness_mock');
      expect(scorecard.disclaimer).toContain('MockReviewModel is pre-programmed');
      expect(scorecard.results).toHaveLength(8);
    }, 60000);

    it('verifies individual fixtures detect defect and suppress clean false-positives', () => {
      for (const res of scorecard.results) {
        expect(res.detectedExpected).toBe(true);
        expect(res.negativeFindings).toBe(0);
        expect(res.passed).toBe(true);
      }
    });

    it('verifies harness integrity metrics are labeled properly without false quality claims', () => {
      expect(scorecard.truePositives).toBe(4);
      expect(scorecard.falseNegatives).toBe(0);
      expect(scorecard.falsePositives).toBe(0);
      expect(scorecard.passed).toBe(true);
    });
  });

  describe('Live Evaluation Invariants and Guardrails', () => {
    it('fails if live mode is requested with a MockReviewModel override', async () => {
      await expect(
        runEvaluationHarness({
          live: true,
          modelOverride: new MockReviewModel(),
        })
      ).rejects.toThrow(/Live evaluation invariant violated/);
    });

    it('fails if live mode is requested but NVIDIA_API_KEY is not set', async () => {
      const originalKey = process.env.NVIDIA_API_KEY;
      try {
        delete process.env.NVIDIA_API_KEY;
        await expect(
          runEvaluationHarness({
            live: true,
          })
        ).rejects.toThrow(/NVIDIA_API_KEY environment variable is not set/);
      } finally {
        if (originalKey) {
          process.env.NVIDIA_API_KEY = originalKey;
        }
      }
    });
  });
});
