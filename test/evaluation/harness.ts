/**
 * Multi-language Golden Review Evaluation Harness with Negative Clean Pairing.
 * Quantitatively asserts review precision (> 70%) and false-positive suppression (< 30%).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import { ReviewUseCase } from '../../src/application/review.js';
import { createLogger } from '../../src/logging/index.js';
import { LocalNvidiaProvider } from '../../src/model/index.js';
import type { ReviewModel } from '../../src/model/types.js';
import { createTestFinding, MockReviewModel } from '../../src/review/__tests__/mocks.js';
import type { RankedFinding, ReviewSeverity } from '../../src/review/types.js';
import type {
  EvaluationResult,
  EvaluationScorecard,
  ExpectedFinding,
  GoldenFixture,
} from './types.js';

const logger = createLogger('evaluation:harness');

const SEVERITY_RANKS: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Multi-factor semantic match assertion evaluating file path,
 * line overlap (with +/-3 lines tolerance), severity, confidence, and category.
 */
export function matchesExpected(finding: RankedFinding, expected: ExpectedFinding): boolean {
  // 1. File path match
  const normFindingFile = finding.file.replace(/\\/g, '/');
  const normExpectedFile = expected.targetFile.replace(/\\/g, '/');
  const fileMatches =
    normFindingFile === normExpectedFile ||
    normFindingFile.endsWith(normExpectedFile) ||
    normExpectedFile.endsWith(normFindingFile);

  if (!fileMatches) {
    return false;
  }

  // 2. Overlapping line range with +/-3 lines tolerance (D-04)
  const startOverlap = Math.max(finding.startLine, expected.lineRange.start);
  const endOverlap = Math.min(finding.endLine, expected.lineRange.end);
  const hasLineOverlap =
    startOverlap <= endOverlap + 3 &&
    finding.startLine <= expected.lineRange.end + 3 &&
    finding.endLine >= expected.lineRange.start - 3;

  if (!hasLineOverlap) {
    return false;
  }

  // 3. Severity equality or higher
  const findingRank = SEVERITY_RANKS[finding.severity] ?? 0;
  const expectedRank = SEVERITY_RANKS[expected.expectedSeverity] ?? 0;
  if (findingRank < expectedRank) {
    return false;
  }

  // 4. Confidence threshold
  if (finding.confidence < expected.minConfidence) {
    return false;
  }

  // 5. Category equality
  if (finding.category !== expected.category) {
    return false;
  }

  // 6. Optional title keyword match
  if (expected.titleContains) {
    const term = expected.titleContains.toLowerCase();
    const titleMatch =
      finding.title.toLowerCase().includes(term) || finding.message.toLowerCase().includes(term);
    if (!titleMatch) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates evaluation scorecard from collected results.
 */
export function calculateScorecard(
  results: EvaluationResult[],
  latencyMs: number
): EvaluationScorecard {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const res of results) {
    if (res.detectedExpected) {
      truePositives += 1;
    } else {
      falseNegatives += 1;
    }
    falsePositives += res.negativeFindings;
  }

  const totalEvaluated = truePositives + falsePositives;
  const precision = totalEvaluated > 0 ? truePositives / totalEvaluated : 1.0;
  const falsePositiveRate = totalEvaluated > 0 ? falsePositives / totalEvaluated : 0.0;
  const passed = precision >= 0.7 && falsePositiveRate <= 0.3 && falseNegatives === 0;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    falsePositiveRate,
    latencyMs,
    passed,
    results,
  };
}

/**
 * Loads golden fixtures from the test fixtures directory.
 */
export async function loadGoldenFixtures(baseDir?: string): Promise<GoldenFixture[]> {
  const root = baseDir ?? path.resolve(process.cwd(), 'test/fixtures/golden');
  const fixtures: GoldenFixture[] = [];

  const categories = ['security', 'structural', 'semantic'];

  for (const cat of categories) {
    const catPath = path.join(root, cat);
    try {
      const subdirs = await fs.readdir(catPath);
      for (const sub of subdirs) {
        const fixtureDir = path.join(catPath, sub);
        const stat = await fs.stat(fixtureDir);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(fixtureDir);
        const expectedFile = files.find((f) => f === 'expected.json');
        if (!expectedFile) continue;

        const expectedRaw = await fs.readFile(path.join(fixtureDir, expectedFile), 'utf-8');
        const expected: ExpectedFinding = JSON.parse(expectedRaw);

        const vulnFile = files.find((f) => f.startsWith('vulnerable.'));
        const cleanFile = files.find((f) => f.startsWith('clean.'));

        if (!vulnFile || !cleanFile) continue;

        const vulnContent = await fs.readFile(path.join(fixtureDir, vulnFile), 'utf-8');
        const cleanContent = await fs.readFile(path.join(fixtureDir, cleanFile), 'utf-8');

        const language: 'typescript' | 'python' = vulnFile.endsWith('.py')
          ? 'python'
          : 'typescript';

        fixtures.push({
          name: `${cat}/${sub}`,
          category: cat,
          language,
          vulnerableFile: vulnFile,
          vulnerableContent: vulnContent,
          cleanFile,
          cleanContent: cleanContent,
          diff: '',
          cleanDiff: '',
          expected,
        });
      }
    } catch {
      // Ignore missing category folders
    }
  }

  return fixtures;
}

/**
 * Creates an in-memory mock model pre-programmed for the golden fixtures.
 */
function createMockModelForFixture(fixture: GoldenFixture, isClean: boolean): ReviewModel {
  const model = new MockReviewModel();

  if (isClean) {
    // Clean mode: Critic rejects or reviewer finds no defect
    return model;
  }

  // Vulnerable mode: produce ground-truth finding matching expected.json
  const exp = fixture.expected;
  const finding = createTestFinding({
    title: `${exp.category.toUpperCase()} defect: ${exp.titleContains ?? fixture.name}`,
    message: `Identified ${exp.expectedSeverity} issue in ${exp.targetFile} around line ${exp.lineRange.start}`,
    severity: exp.expectedSeverity,
    category: exp.category,
    file: exp.targetFile,
    startLine: exp.lineRange.start,
    endLine: exp.lineRange.end,
    confidence: Math.max(0.9, exp.minConfidence),
    evidence: [
      {
        file: exp.targetFile,
        startLine: exp.lineRange.start,
        endLine: exp.lineRange.end,
        relationship: 'caller',
        explanation: 'Ground truth defect location',
      },
    ],
  });

  const responseHandler = async () => ({
    findings: [finding],
    usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
    model: 'mock-nemotron',
    latencyMs: 15,
    finishReason: 'stop',
  });

  // Handle reviewer roles and critic
  model.setRoleHandler('security', responseHandler);
  model.setRoleHandler('structural', responseHandler);
  model.setRoleHandler('semantic', responseHandler);
  model.setRoleHandler('critic', responseHandler);

  return model;
}

/**
 * Runs the evaluation harness across all golden review fixtures.
 */
export async function runEvaluationHarness(options?: {
  live?: boolean;
  fixturesDir?: string;
}): Promise<EvaluationScorecard> {
  const startTime = Date.now();
  const fixtures = await loadGoldenFixtures(options?.fixturesDir);
  const results: EvaluationResult[] = [];

  logger.info({ fixtureCount: fixtures.length }, 'Starting golden review evaluation');

  for (const fixture of fixtures) {
    const fixtureStart = Date.now();
    const tempDir = await fs.mkdtemp(path.join('/tmp', `octate-eval-${fixture.category}-`));

    try {
      // 1. Initialize temporary git repository
      await git.init({ fs, dir: tempDir });
      await git.setConfig({ fs, dir: tempDir, path: 'user.name', value: 'Evaluation Harness' });
      await git.setConfig({ fs, dir: tempDir, path: 'user.email', value: 'eval@octate.dev' });

      // Initial empty commit
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Evaluation Repo\n');
      await git.add({ fs, dir: tempDir, filepath: 'README.md' });
      await git.commit({ fs, dir: tempDir, message: 'Initial commit' });

      // 2. Evaluate Vulnerable state
      const targetFilePath = path.join(tempDir, fixture.expected.targetFile);
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
      await fs.writeFile(targetFilePath, fixture.vulnerableContent);

      const useCase = new ReviewUseCase();
      const vulnModel = options?.live
        ? new LocalNvidiaProvider()
        : createMockModelForFixture(fixture, false);

      const vulnResult = await useCase.execute({
        repoRoot: tempDir,
        modelOverride: vulnModel,
      });

      const matchedFindings = vulnResult.findings.filter((f) =>
        matchesExpected(f, fixture.expected)
      );
      const unmatchedFindings = vulnResult.findings.filter(
        (f) => !matchesExpected(f, fixture.expected)
      );
      const detectedExpected = matchedFindings.length > 0;

      // 3. Evaluate Clean counterpart (negative testing)
      await fs.writeFile(targetFilePath, fixture.cleanContent);

      const cleanModel = options?.live
        ? new LocalNvidiaProvider()
        : createMockModelForFixture(fixture, true);

      const cleanResult = await useCase.execute({
        repoRoot: tempDir,
        modelOverride: cleanModel,
      });

      const negativeFindings = cleanResult.findings.length;
      const fixtureLatency = Date.now() - fixtureStart;
      const passed =
        detectedExpected && negativeFindings === fixture.expected.expectedNegativeFindings;

      results.push({
        fixtureName: fixture.name,
        detectedExpected,
        actualFindings: vulnResult.findings.length,
        expectedFindings: 1,
        negativeFindings,
        passed,
        latencyMs: fixtureLatency,
        matchedFindings,
        unmatchedFindings,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  const totalDuration = Date.now() - startTime;
  return calculateScorecard(results, totalDuration);
}
