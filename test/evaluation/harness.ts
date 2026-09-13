/**
 * Multi-language Golden Review Evaluation Harness with Negative Clean Pairing.
 * Explicitly separates Mock Harness Integrity verification from Live Pipeline Evaluation.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as git from 'isomorphic-git';
import { ReviewUseCase } from '../../src/application/review.js';
import { AuthenticationError } from '../../src/errors/index.js';
import { createLogger } from '../../src/logging/index.js';
import { LocalNvidiaProvider } from '../../src/model/index.js';
import type { ReviewModel } from '../../src/model/types.js';
import { createTestFinding, MockReviewModel } from '../../src/review/__tests__/mocks.js';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../../src/review/types.js';
import type {
  EvaluationMode,
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

  // 2. Overlapping line range with +/-3 lines tolerance
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
  latencyMs: number,
  mode: EvaluationMode = 'harness_mock',
  modelName = 'mock-nemotron'
): EvaluationScorecard {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let apiFailures = 0;

  for (const res of results) {
    truePositives += res.truePositives;
    falsePositives += res.falsePositives;
    falseNegatives += res.falseNegatives;
    totalPromptTokens += res.promptTokens;
    totalCompletionTokens += res.completionTokens;
    totalTokens += res.totalTokens;
    apiFailures += res.apiFailures;
  }

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50Index = Math.floor(latencies.length * 0.5);
  const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
  const p50LatencyMs = latencies[p50Index] ?? 0;
  const p95LatencyMs = latencies[p95Index] ?? 0;

  const totalEvaluated = truePositives + falsePositives;
  const precision = totalEvaluated > 0 ? truePositives / totalEvaluated : 1.0;
  const falsePositiveRate = totalEvaluated > 0 ? falsePositives / totalEvaluated : 0.0;
  const recallDenominator = truePositives + falseNegatives;
  const recall = recallDenominator > 0 ? truePositives / recallDenominator : 1.0;

  const isMock = mode === 'harness_mock';
  const modeLabel = isMock
    ? 'HARNESS INTEGRITY TEST (MOCKS) - NOT A MEASURE OF REAL DETECTION QUALITY'
    : `LIVE PIPELINE EVALUATION (${modelName})`;

  const disclaimer = isMock
    ? "METHODOLOGICAL NOTICE: MockReviewModel is pre-programmed to emit expected findings to verify testbed plumbing, schema contracts, and semantic matchers. These numbers verify harness integrity only and MUST NOT be cited as evidence of Octate's detection quality."
    : undefined;

  const passed = isMock
    ? results.every((r) => r.passed)
    : precision >= 0.75 && falsePositiveRate <= 0.25 && recall >= 0.7 && apiFailures === 0;

  return {
    mode,
    modeLabel,
    modelName,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    falsePositiveRate,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    p50LatencyMs,
    p95LatencyMs,
    latencyMs,
    apiFailures,
    passed,
    disclaimer,
    results,
  };
}

/**
 * Loads golden fixtures from the test fixtures directory.
 */
export async function loadGoldenFixtures(baseDir?: string): Promise<GoldenFixture[]> {
  const root = baseDir ?? path.resolve(process.cwd(), 'test/fixtures/golden');
  const fixtures: GoldenFixture[] = [];

  const categories = ['security', 'structural', 'semantic', 'refactor', 'docs', 'test'];

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

        const language: 'typescript' | 'python' | 'markdown' | 'other' = vulnFile.endsWith('.py')
          ? 'python'
          : vulnFile.endsWith('.md')
            ? 'markdown'
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
 * Creates an in-memory mock model pre-programmed for the golden fixtures (harness integrity only).
 */
export function createMockModelForFixture(fixture: GoldenFixture, isClean: boolean): ReviewModel {
  const model = new MockReviewModel();

  if (isClean || fixture.expected.hasDefect === false) {
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
    finishReason: 'stop' as const,
  });

  model.setRoleHandler('security', responseHandler);
  model.setRoleHandler('structural', responseHandler);
  model.setRoleHandler('semantic', responseHandler);
  model.setRoleHandler('critic', responseHandler);

  return model;
}

export interface RunEvaluationOptions {
  live?: boolean;
  fixturesDir?: string;
  fixtureFilter?: string;
  modelOverride?: ReviewModel;
}

/**
 * Runs the evaluation harness across golden review fixtures.
 * Supports distinct mock harness integrity mode vs live pipeline mode.
 */
export async function runEvaluationHarness(
  options?: RunEvaluationOptions
): Promise<EvaluationScorecard> {
  const isLive = Boolean(options?.live);
  const mode: EvaluationMode = isLive ? 'live_pipeline' : 'harness_mock';

  let liveModel: ReviewModel | null = null;
  let modelName = 'mock-nemotron';

  if (isLive) {
    if (options?.modelOverride && options.modelOverride.constructor.name === 'MockReviewModel') {
      throw new Error(
        'Live evaluation invariant violated: MockReviewModel detected in live evaluation mode!'
      );
    }

    // Try loading .env if NVIDIA_API_KEY is not already set
    if (!process.env.NVIDIA_API_KEY) {
      try {
        process.loadEnvFile();
      } catch {
        // Ignore missing .env
      }
    }

    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
      throw new AuthenticationError(
        'Live evaluation requested (--live), but NVIDIA_API_KEY environment variable is not set. Silent fallback to mocks is strictly prohibited.'
      );
    }

    if (options?.modelOverride) {
      liveModel = options.modelOverride;
    } else {
      liveModel = new LocalNvidiaProvider({ apiKey: key });
    }

    if (liveModel.constructor.name === 'MockReviewModel') {
      throw new Error(
        'Live evaluation invariant violated: Mock model detected in live evaluation mode!'
      );
    }
    modelName = (liveModel as { modelId?: string }).modelId ?? 'nvidia/nemotron-3-ultra-550b-a55b';
  }

  const startTime = Date.now();
  let fixtures = await loadGoldenFixtures(options?.fixturesDir);
  if (options?.fixtureFilter) {
    fixtures = fixtures.filter((f) => f.name.includes(options.fixtureFilter!));
  }

  const results: EvaluationResult[] = [];
  logger.info(
    { fixtureCount: fixtures.length, mode, modelName },
    'Starting golden review evaluation'
  );

  for (const fixture of fixtures) {
    const fixtureStart = Date.now();
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), `octate-eval-${fixture.category}-`));

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let apiFailures = 0;

    let vulnResult: ReviewResult = {
      summary: {
        totalFindings: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {
          correctness: 0,
          security: 0,
          performance: 0,
          architecture: 0,
          reliability: 0,
          maintainability: 0,
          compatibility: 0,
          testing: 0,
        },
        byReviewer: {},
        filesAnalyzed: 0,
        durationMs: 0,
      },
      findings: [],
      metadata: {
        scopeType: 'working-tree',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        model: modelName,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        warnings: [],
        reviewersTriggered: [],
        criticInvoked: false,
        preCriticFindingCount: 0,
        postCriticFindingCount: 0,
      },
    };

    let cleanResult: ReviewResult = { ...vulnResult, findings: [] };
    let vulnLatencyMs = 0;
    let cleanLatencyMs = 0;

    try {
      // 1. Initialize isolated temporary git repository
      await git.init({ fs, dir: tempDir });
      await git.setConfig({ fs, dir: tempDir, path: 'user.name', value: 'Evaluation Harness' });
      await git.setConfig({ fs, dir: tempDir, path: 'user.email', value: 'eval@octate.dev' });

      const targetFilePath = path.join(tempDir, fixture.expected.targetFile);
      const relativeTarget = fixture.expected.targetFile;
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });

      // Clean baseline commit
      const baseContent =
        fixture.language === 'python'
          ? '# Baseline module stub\n'
          : fixture.language === 'markdown'
            ? '# Documentation Baseline\n'
            : '// Baseline module stub\nexport {};\n';
      await fs.writeFile(targetFilePath, baseContent, 'utf-8');
      await fs.writeFile(
        path.join(tempDir, 'README.md'),
        `# Evaluation Repo for ${fixture.name}\n`,
        'utf-8'
      );
      await git.add({ fs, dir: tempDir, filepath: 'README.md' });
      await git.add({ fs, dir: tempDir, filepath: relativeTarget });
      await git.commit({ fs, dir: tempDir, message: 'Initial baseline commit' });

      // 2. Evaluate Vulnerable Variant with Realistic Git Diff
      await fs.writeFile(targetFilePath, fixture.vulnerableContent, 'utf-8');

      const vulnModel = isLive ? liveModel! : createMockModelForFixture(fixture, false);
      if (isLive && vulnModel.constructor.name === 'MockReviewModel') {
        throw new Error(
          'Live evaluation invariant violated: Mock model detected for vulnerable evaluation'
        );
      }

      const useCase = new ReviewUseCase();
      const vulnStart = Date.now();
      try {
        vulnResult = await useCase.execute({
          repoRoot: tempDir,
          scopeOptions: { type: 'working-tree', repoRoot: tempDir },
          modelOverride: vulnModel,
        });
      } catch (err) {
        apiFailures++;
        logger.error({ fixture: fixture.name, error: err }, 'Vulnerable evaluation failed');
      }
      vulnLatencyMs = Date.now() - vulnStart;

      promptTokens += vulnResult.metadata?.promptTokens ?? 0;
      completionTokens += vulnResult.metadata?.completionTokens ?? 0;
      totalTokens += vulnResult.metadata?.totalTokens ?? 0;

      // 3. Evaluate Clean Variant with Realistic Git Diff
      await fs.writeFile(targetFilePath, fixture.cleanContent, 'utf-8');

      const cleanModel = isLive ? liveModel! : createMockModelForFixture(fixture, true);
      if (isLive && cleanModel.constructor.name === 'MockReviewModel') {
        throw new Error(
          'Live evaluation invariant violated: Mock model detected for clean evaluation'
        );
      }

      const cleanStart = Date.now();
      try {
        cleanResult = await useCase.execute({
          repoRoot: tempDir,
          scopeOptions: { type: 'working-tree', repoRoot: tempDir },
          modelOverride: cleanModel,
        });
      } catch (err) {
        apiFailures++;
        logger.error({ fixture: fixture.name, error: err }, 'Clean evaluation failed');
      }
      cleanLatencyMs = Date.now() - cleanStart;

      promptTokens += cleanResult.metadata?.promptTokens ?? 0;
      completionTokens += cleanResult.metadata?.completionTokens ?? 0;
      totalTokens += cleanResult.metadata?.totalTokens ?? 0;

      const hasDefect = fixture.expected.hasDefect !== false;
      const negativeFindings = cleanResult.findings.length;
      let truePositives = 0;
      let falseNegatives = 0;
      let falsePositives = 0;
      let detectedExpected = false;
      let matchedFindings: RankedFinding[] = [];
      let unmatchedFindings: RankedFinding[] = [];

      if (hasDefect) {
        matchedFindings = vulnResult.findings.filter((f) => matchesExpected(f, fixture.expected));
        unmatchedFindings = vulnResult.findings.filter(
          (f) => !matchesExpected(f, fixture.expected)
        );
        detectedExpected = matchedFindings.length > 0;
        truePositives = detectedExpected ? 1 : 0;
        falseNegatives = detectedExpected ? 0 : 1;
        falsePositives = unmatchedFindings.length + negativeFindings;
      } else {
        detectedExpected = true;
        truePositives = 0;
        falseNegatives = 0;
        falsePositives = vulnResult.findings.length + negativeFindings;
        unmatchedFindings = [...vulnResult.findings];
      }

      const precision =
        truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1.0;
      const recall =
        truePositives + falseNegatives > 0
          ? truePositives / (truePositives + falseNegatives)
          : hasDefect
            ? 0.0
            : 1.0;

      const fixtureLatency = Date.now() - fixtureStart;
      const passed =
        apiFailures === 0 &&
        (hasDefect
          ? detectedExpected &&
            cleanResult.findings.length <= fixture.expected.expectedNegativeFindings &&
            falsePositives === 0
          : falsePositives === 0);

      results.push({
        fixtureName: fixture.name,
        category: fixture.category,
        language: fixture.language,
        mode,
        model: modelName,
        detectedExpected,
        truePositives,
        falsePositives,
        falseNegatives,
        precision,
        recall,
        vulnerableFindings: vulnResult.findings,
        cleanFindings: cleanResult.findings,
        matchedFindings,
        unmatchedFindings,
        rawFindingsCount: vulnResult.findings.length,
        actualFindings: vulnResult.findings.length,
        expectedFindings: hasDefect ? 1 : 0,
        negativeFindings,
        latencyMs: fixtureLatency,
        vulnerableLatencyMs: vulnLatencyMs,
        cleanLatencyMs: cleanLatencyMs,
        promptTokens,
        completionTokens,
        totalTokens,
        apiFailures,
        passed,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  const totalDuration = Date.now() - startTime;
  return calculateScorecard(results, totalDuration, mode, modelName);
}
