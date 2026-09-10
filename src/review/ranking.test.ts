import { describe, expect, it } from '@jest/globals';
import { ReferenceGraph } from '../intelligence/graph/reference.js';
import type { SymbolIndex } from '../intelligence/index/symbol-index.js';
import type { ModelFinding } from '../model/types.js';
import {
  calculateBlastRadius,
  calculateCompositeScore,
  calculateConfidenceScore,
  calculateEvidenceStrength,
  calculateRegressionProbability,
  calculateSecurityImpact,
  calculateSeverityScore,
  rankAndTruncateFindings,
} from './ranking.js';

function createMockFinding(overrides: Partial<ModelFinding> = {}): ModelFinding {
  return {
    severity: 'medium',
    category: 'correctness',
    title: 'Potential null pointer dereference',
    message: 'Variable user might be null when accessed',
    file: 'src/user.ts',
    startLine: 25,
    endLine: 25,
    confidence: 0.85,
    evidence: [
      {
        file: 'src/user.ts',
        startLine: 20,
        endLine: 25,
        relationship: 'origin',
        explanation: 'Origin of user object without null check',
      },
    ],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'High chance of runtime exception',
    suggestedFix: 'if (!user) { return null; }\nreturn user.name;',
    reviewer: 'structural',
    ...overrides,
  };
}

describe('ranking', () => {
  describe('calculateSeverityScore', () => {
    it('returns exact score for each severity level', () => {
      expect(calculateSeverityScore('critical')).toBe(100);
      expect(calculateSeverityScore('high')).toBe(75);
      expect(calculateSeverityScore('medium')).toBe(50);
      expect(calculateSeverityScore('low')).toBe(25);
      expect(calculateSeverityScore('info')).toBe(10);
    });
  });

  describe('calculateConfidenceScore', () => {
    it('rounds and clamps confidence to 0-100', () => {
      expect(calculateConfidenceScore(0.85)).toBe(85);
      expect(calculateConfidenceScore(0.999)).toBe(100);
      expect(calculateConfidenceScore(0.0)).toBe(0);
      expect(calculateConfidenceScore(-0.1)).toBe(0);
      expect(calculateConfidenceScore(1.2)).toBe(100);
    });
  });

  describe('calculateEvidenceStrength', () => {
    it('returns 0 for missing or empty evidence', () => {
      const f1 = createMockFinding({ evidence: [] });
      expect(calculateEvidenceStrength(f1)).toBe(0);

      const base = createMockFinding();
      // @ts-expect-error test empty evidence
      const f2: ModelFinding = { ...base, evidence: undefined };
      expect(calculateEvidenceStrength(f2)).toBe(0);
    });

    it('calculates base scores by count', () => {
      // 1 item base = 40. Since span <= 10, specificity bonus = +5 => 45
      const f1 = createMockFinding({
        evidence: [{ file: 'src/user.ts', startLine: 1, endLine: 5, relationship: 'ref', explanation: '' }],
      });
      expect(calculateEvidenceStrength(f1)).toBe(45);

      // 1 item with span > 10 (no specificity bonus) => 40
      const f1Wide = createMockFinding({
        evidence: [{ file: 'src/user.ts', startLine: 1, endLine: 25, relationship: 'ref', explanation: '' }],
      });
      expect(calculateEvidenceStrength(f1Wide)).toBe(40);

      // 2 items wide (base 70, single file, span > 10) => 70
      const f2 = createMockFinding({
        evidence: [
          { file: 'src/user.ts', startLine: 1, endLine: 25, relationship: 'ref', explanation: '' },
          { file: 'src/user.ts', startLine: 30, endLine: 60, relationship: 'ref', explanation: '' },
        ],
      });
      expect(calculateEvidenceStrength(f2)).toBe(70);

      // 3 items wide => 90
      const f3 = createMockFinding({
        evidence: [
          { file: 'src/user.ts', startLine: 1, endLine: 25, relationship: 'ref', explanation: '' },
          { file: 'src/user.ts', startLine: 30, endLine: 60, relationship: 'ref', explanation: '' },
          { file: 'src/user.ts', startLine: 70, endLine: 100, relationship: 'ref', explanation: '' },
        ],
      });
      expect(calculateEvidenceStrength(f3)).toBe(90);
    });

    it('awards diversity bonus for >= 2 unique files and specificity bonus for tight spans', () => {
      // 2 items, 2 unique files (+10), all spans <= 10 (+5): 70 + 10 + 5 = 85
      const f = createMockFinding({
        evidence: [
          { file: 'src/user.ts', startLine: 1, endLine: 5, relationship: 'ref', explanation: '' },
          { file: 'src/auth.ts', startLine: 10, endLine: 15, relationship: 'ref', explanation: '' },
        ],
      });
      expect(calculateEvidenceStrength(f)).toBe(85);

      // 3 items, 2 files (+10), all spans <= 10 (+5): 90 + 10 + 5 = 105 -> clamped to 100
      const fMax = createMockFinding({
        evidence: [
          { file: 'src/user.ts', startLine: 1, endLine: 5, relationship: 'ref', explanation: '' },
          { file: 'src/auth.ts', startLine: 10, endLine: 15, relationship: 'ref', explanation: '' },
          { file: 'src/api.ts', startLine: 20, endLine: 22, relationship: 'ref', explanation: '' },
        ],
      });
      expect(calculateEvidenceStrength(fMax)).toBe(100);
    });
  });

  describe('calculateBlastRadius', () => {
    it('scales logarithmically according to N dependents (N=0->10, N=1->33, N=3->55, N>=15->100)', () => {
      const graph = new ReferenceGraph();
      const finding = createMockFinding({ file: 'src/user.ts', startLine: 10 });

      // N = 0 (no callers, no importers) -> 10
      expect(calculateBlastRadius(finding, graph)).toBe(10);

      // N = 1 (1 importer) -> 33
      graph.addEdge({
        from: 'src/app.ts',
        to: 'src/user.ts',
        kind: 'imports',
      });
      expect(calculateBlastRadius(finding, graph)).toBe(33);

      // N = 3 (add 2 more importers) -> 55
      graph.addEdge({ from: 'src/service.ts', to: 'src/user.ts', kind: 'imports' });
      graph.addEdge({ from: 'src/controller.ts', to: 'src/user.ts', kind: 'imports' });
      expect(calculateBlastRadius(finding, graph)).toBe(55);

      // N >= 15 -> 100
      for (let i = 4; i <= 20; i++) {
        graph.addEdge({ from: `src/mod${i}.ts`, to: 'src/user.ts', kind: 'imports' });
      }
      expect(calculateBlastRadius(finding, graph)).toBe(100);
    });

    it('resolves enclosing symbol callers through SymbolIndex', () => {
      const graph = new ReferenceGraph();
      const finding = createMockFinding({ file: 'src/user.ts', startLine: 25 });

      const mockSymbolIndex = {
        getFileSymbols: (file: string) => {
          if (file === 'src/user.ts') {
            return [
              {
                id: 'sym:getUser',
                name: 'getUser',
                kind: 'function' as const,
                file: 'src/user.ts',
                range: { startLine: 20, endLine: 35 },
              },
            ];
          }
          return [];
        },
      } as unknown as SymbolIndex;

      // Add callers to sym:getUser
      graph.addEdge({ from: 'caller1', to: 'sym:getUser', kind: 'calls' });
      graph.addEdge({ from: 'caller2', to: 'sym:getUser', kind: 'calls' });
      graph.addEdge({ from: 'caller3', to: 'sym:getUser', kind: 'calls' });

      // N = 3 callers -> 55
      expect(calculateBlastRadius(finding, graph, mockSymbolIndex)).toBe(55);
    });
  });

  describe('calculateSecurityImpact', () => {
    it('returns exact scores for security category', () => {
      expect(calculateSecurityImpact(createMockFinding({ category: 'security', severity: 'critical' }))).toBe(100);
      expect(calculateSecurityImpact(createMockFinding({ category: 'security', severity: 'high' }))).toBe(85);
      expect(calculateSecurityImpact(createMockFinding({ category: 'security', severity: 'medium' }))).toBe(60);
      expect(calculateSecurityImpact(createMockFinding({ category: 'security', severity: 'low' }))).toBe(40);
      expect(calculateSecurityImpact(createMockFinding({ category: 'security', severity: 'info' }))).toBe(20);
    });

    it('returns 15 for non-security category matching security keywords', () => {
      const finding = createMockFinding({
        category: 'correctness',
        title: 'SQL injection vulnerability detected',
        message: 'Unsanitized input in query',
      });
      expect(calculateSecurityImpact(finding)).toBe(15);
    });

    it('returns 0 for non-security category without security keywords', () => {
      const finding = createMockFinding({
        category: 'correctness',
        title: 'Unused variable',
        message: 'Variable foo is not referenced',
      });
      expect(calculateSecurityImpact(finding)).toBe(0);
    });
  });

  describe('calculateRegressionProbability', () => {
    it('returns category base with coupling bonus when blastRadius >= 50', () => {
      const correctnessLow = createMockFinding({ category: 'correctness' });
      expect(calculateRegressionProbability(correctnessLow, 33)).toBe(85);
      expect(calculateRegressionProbability(correctnessLow, 55)).toBe(100); // 85 + 15 = 100

      const perf = createMockFinding({ category: 'performance' });
      expect(calculateRegressionProbability(perf, 10)).toBe(50);
      expect(calculateRegressionProbability(perf, 50)).toBe(65); // 50 + 15 = 65
    });
  });

  describe('calculateCompositeScore', () => {
    it('computes exact 30/20/15/15/10/10 weighted score', () => {
      const graph = new ReferenceGraph();
      // finding: critical (100), confidence 1.0 (100), evidence 3 tight 2 files (100), blastRadius 0 (10), security critical (100), regression 30 (security base 30)
      const finding = createMockFinding({
        severity: 'critical',
        confidence: 1.0,
        category: 'security',
        evidence: [
          { file: 'src/a.ts', startLine: 1, endLine: 2, relationship: 'ref', explanation: '' },
          { file: 'src/b.ts', startLine: 1, endLine: 2, relationship: 'ref', explanation: '' },
          { file: 'src/b.ts', startLine: 5, endLine: 6, relationship: 'ref', explanation: '' },
        ],
      });

      const { compositeScore, scoreBreakdown } = calculateCompositeScore(finding, graph);

      // Severity: 100 * 0.30 = 30
      // Confidence: 100 * 0.20 = 20
      // Evidence: 100 * 0.15 = 15
      // BlastRadius: 10 * 0.15 = 1.5
      // SecurityImpact: 100 * 0.10 = 10
      // RegressionProbability: 30 * 0.10 = 3
      // Total: 30 + 20 + 15 + 1.5 + 10 + 3 = 79.5
      expect(scoreBreakdown.severityScore).toBe(100);
      expect(scoreBreakdown.confidenceScore).toBe(100);
      expect(scoreBreakdown.evidenceStrengthScore).toBe(100);
      expect(scoreBreakdown.blastRadiusScore).toBe(10);
      expect(scoreBreakdown.securityImpactScore).toBe(100);
      expect(scoreBreakdown.regressionProbabilityScore).toBe(30);
      expect(compositeScore).toBe(79.5);
    });
  });

  describe('rankAndTruncateFindings', () => {
    const graph = new ReferenceGraph();

    it('filters findings below minSeverity', () => {
      const fCritical = createMockFinding({ severity: 'critical', title: 'Crit' });
      const fHigh = createMockFinding({ severity: 'high', title: 'High' });
      const fMedium = createMockFinding({ severity: 'medium', title: 'Med' });
      const fLow = createMockFinding({ severity: 'low', title: 'Low' });
      const fInfo = createMockFinding({ severity: 'info', title: 'Info' });

      const results = rankAndTruncateFindings({
        findings: [fCritical, fHigh, fMedium, fLow, fInfo],
        referenceGraph: graph,
        minSeverity: 'high',
      });

      const severities = results.map((r) => r.severity);
      expect(severities).toContain('critical');
      expect(severities).toContain('high');
      expect(severities).not.toContain('medium');
      expect(severities).not.toContain('low');
      expect(severities).not.toContain('info');
    });

    it('caps non-critical findings at maxFindings', () => {
      const findings = Array.from({ length: 10 }, (_, i) =>
        createMockFinding({
          severity: 'medium',
          title: `Medium finding ${i}`,
          startLine: i + 1,
        })
      );

      const results = rankAndTruncateFindings({
        findings,
        referenceGraph: graph,
        maxFindings: 5,
      });

      expect(results.length).toBe(5);
    });

    it('NEVER truncates Critical severity findings even when count exceeds maxFindings', () => {
      const criticals = Array.from({ length: 8 }, (_, i) =>
        createMockFinding({
          severity: 'critical',
          title: `Critical issue ${i}`,
          startLine: i + 1,
        })
      );
      const highs = Array.from({ length: 5 }, (_, i) =>
        createMockFinding({
          severity: 'high',
          title: `High issue ${i}`,
          startLine: i + 20,
        })
      );

      // maxFindings is 5, but there are 8 criticals!
      const results = rankAndTruncateFindings({
        findings: [...criticals, ...highs],
        referenceGraph: graph,
        maxFindings: 5,
      });

      // All 8 criticals must be present
      const criticalResults = results.filter((r) => r.severity === 'critical');
      expect(criticalResults.length).toBe(8);
      expect(results.length).toBe(8); // No available slots for highs
    });

    it('allocates remaining slots to non-critical findings when criticals < maxFindings', () => {
      const criticals = Array.from({ length: 2 }, (_, i) =>
        createMockFinding({
          severity: 'critical',
          title: `Critical issue ${i}`,
          startLine: i + 1,
        })
      );
      const mediums = Array.from({ length: 10 }, (_, i) =>
        createMockFinding({
          severity: 'medium',
          title: `Medium issue ${i}`,
          startLine: i + 10,
        })
      );

      // maxFindings = 5: 2 criticals + 3 mediums = 5
      const results = rankAndTruncateFindings({
        findings: [...criticals, ...mediums],
        referenceGraph: graph,
        maxFindings: 5,
      });

      expect(results.length).toBe(5);
      const criticalResults = results.filter((r) => r.severity === 'critical');
      expect(criticalResults.length).toBe(2);
      const mediumResults = results.filter((r) => r.severity === 'medium');
      expect(mediumResults.length).toBe(3);
    });
  });
});
