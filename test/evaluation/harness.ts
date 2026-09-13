/**
 * Multi-language Golden Review Evaluation Harness with Negative Clean Pairing.
 * Explicitly separates Mock Harness Integrity verification from Live Pipeline Evaluation.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as git from "isomorphic-git";
import { ReviewUseCase } from "../../src/application/review.js";
import { AuthenticationError } from "../../src/errors/index.js";
import { createLogger } from "../../src/logging/index.js";
import { LocalNvidiaProvider } from "../../src/model/index.js";
import type { ModelFinding, ModelRequest, ModelResponse, ModelUsage, ReviewModel } from "../../src/model/types.js";
import { createTestFinding, MockReviewModel } from "../../src/review/__tests__/mocks.js";
import type { RankedFinding, ReviewResult, ReviewSeverity } from "../../src/review/types.js";
import type {
  EvaluationMode,
  EvaluationResult,
  EvaluationScorecard,
  ExpectedFinding,
  GoldenFixture,
} from "./types.js";

const logger = createLogger("evaluation:harness");

const SEVERITY_RANKS: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Multi-factor semantic match assertion evaluating exact normalized file path,
 * tight line window overlap (+/-1 line tolerance), severity rank equality/exceeding,
 * confidence threshold, category equality, and defect keyword matching.
 */
export function matchesExpected(finding: RankedFinding, expected: ExpectedFinding): boolean {
  // 1. Exact normalized file path match
  const normFindingFile = path.normalize(finding.file).replace(/\\/g, "/").replace(/^\.\//, "");
  const normExpectedFile = path.normalize(expected.targetFile).replace(/\\/g, "/").replace(/^\.\//, "");
  if (normFindingFile !== normExpectedFile) {
    return false;
  }

  // 2. Strict overlapping line range with tight +/-1 line tolerance
  const startOverlap = Math.max(finding.startLine, expected.lineRange.start);
  const endOverlap = Math.min(finding.endLine, expected.lineRange.end);
  const hasLineOverlap =
    startOverlap <= endOverlap + 1 &&
    finding.startLine <= expected.lineRange.end + 1 &&
    finding.endLine >= expected.lineRange.start - 1;

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

  // 6. Semantic defect keyword verification
  const keywords = expected.defectKeywords ?? (expected.titleContains ? [expected.titleContains] : []);
  if (keywords.length > 0) {
    const text = (finding.title + " " + finding.message).toLowerCase();
    const matchesKeyword = keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!matchesKeyword) {
      return false;
    }
  }

  return true;
}

/**
 * Telemetry-tracking wrapper around a ReviewModel to record exact requests,
 * latency, tokens, failures, timeouts, and reviewer-specific findings.
 */
export class TelemetryTrackingModel implements ReviewModel {
  public requestCount = 0;
  public apiFailures = 0;
  public timeoutCount = 0;
  public reviewerCalls: Array<{
    role: string;
    findings: ModelFinding[];
    durationMs: number;
    tokens: ModelUsage;
  }> = [];

  constructor(public inner: ReviewModel) {}

  get modelId(): string | undefined {
    return (this.inner as { modelId?: string }).modelId;
  }

  get endpointUrl(): string | undefined {
    return (this.inner as { endpointUrl?: string }).endpointUrl;
  }

  async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    this.requestCount++;
    const start = Date.now();
    try {
      const resp = await this.inner.generate(request, signal);
      this.reviewerCalls.push({
        role: request.reviewTask ?? "unknown",
        findings: resp.findings,
        durationMs: Date.now() - start,
        tokens: resp.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
      return resp;
    } catch (err) {
      this.apiFailures++;
      if (
        err instanceof Error &&
        (err.name === "ProviderTimeoutError" || err.message.toLowerCase().includes("timeout"))
      ) {
        this.timeoutCount++;
      }
      throw err;
    }
  }
}

/**
 * Calculates evaluation scorecard from collected results.
 */
export function calculateScorecard(
  results: EvaluationResult[],
  latencyMs: number,
  mode: EvaluationMode = "harness_mock",
  provider = "nvidia",
  modelName = "mock-nemotron",
  endpoint = "https://integrate.api.nvidia.com/v1/chat/completions",
  totalRequests = 0,
  timeoutCount = 0
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

  const isMock = mode === "harness_mock";
  const modeLabel = isMock
    ? "HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE"
    : `LIVE PIPELINE EVALUATION (${provider}: ${modelName})`;

  const disclaimer = isMock
    ? "HARNESS INTEGRITY ONLY — NOT AI QUALITY EVIDENCE. MockReviewModel is pre-programmed to emit synthetic findings to assert harness plumbing and matcher correctness. These results do NOT reflect real model detection capabilities."
    : undefined;

  const passed = isMock
    ? results.every((r) => r.passed)
    : precision >= 0.7 && falsePositiveRate <= 0.3 && recall >= 0.7 && apiFailures === 0;

  return {
    mode,
    modeLabel,
    provider,
    modelName,
    endpoint,
    totalRequests,
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
    timeoutCount,
    passed,
    disclaimer,
    results,
    rawResults: results,
  };
}

/**
 * Loads golden fixtures from the test fixtures directory.
 */
export async function loadGoldenFixtures(baseDir?: string): Promise<GoldenFixture[]> {
  const root = baseDir ?? path.resolve(process.cwd(), "test/fixtures/golden");
  const fixtures: GoldenFixture[] = [];

  const categories = ["security", "structural", "semantic", "refactor", "docs", "test"];

  for (const cat of categories) {
    const catPath = path.join(root, cat);
    try {
      const subdirs = await fs.readdir(catPath);
      for (const sub of subdirs) {
        const fixtureDir = path.join(catPath, sub);
        const stat = await fs.stat(fixtureDir);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(fixtureDir);
        const expectedFile = files.find((f) => f === "expected.json");
        if (!expectedFile) continue;

        const expectedRaw = await fs.readFile(path.join(fixtureDir, expectedFile), "utf-8");
        const expected: ExpectedFinding = JSON.parse(expectedRaw);

        const vulnFile = files.find((f) => f.startsWith("vulnerable."));
        const cleanFile = files.find((f) => f.startsWith("clean."));
        const baseFile = files.find((f) => f.startsWith("baseline."));

        if (!vulnFile || !cleanFile) continue;

        const vulnContent = await fs.readFile(path.join(fixtureDir, vulnFile), "utf-8");
        const cleanContent = await fs.readFile(path.join(fixtureDir, cleanFile), "utf-8");
        const baseContent = baseFile
          ? await fs.readFile(path.join(fixtureDir, baseFile), "utf-8")
          : undefined;

        const language: "typescript" | "python" | "markdown" | "other" = vulnFile.endsWith(".py")
          ? "python"
          : vulnFile.endsWith(".md")
            ? "markdown"
            : "typescript";

        fixtures.push({
          name: `${cat}/${sub}`,
          category: cat,
          language,
          baselineFile: baseFile,
          baselineContent: baseContent,
          vulnerableFile: vulnFile,
          vulnerableContent: vulnContent,
          cleanFile,
          cleanContent: cleanContent,
          diff: "",
          cleanDiff: "",
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
    return model;
  }

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
        relationship: "caller",
        explanation: "Ground truth defect location",
      },
    ],
  });

  const responseHandler = async () => ({
    findings: [finding],
    usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
    model: "mock-nemotron",
    latencyMs: 15,
    finishReason: "stop" as const,
  });

  model.setRoleHandler("security", responseHandler);
  model.setRoleHandler("structural", responseHandler);
  model.setRoleHandler("semantic", responseHandler);
  model.setRoleHandler("critic", responseHandler);

  return model;
}

export interface RunEvaluationOptions {
  live?: boolean;
  fixturesDir?: string;
  fixtureFilter?: string;
  modelOverride?: ReviewModel;
  timeoutMs?: number;
}

/**
 * Runs the evaluation harness across golden review fixtures.
 * Explicitly separates Mock Harness Integrity verification from Live Pipeline Evaluation.
 */
export async function runEvaluationHarness(
  options?: RunEvaluationOptions
): Promise<EvaluationScorecard> {
  const isLive = Boolean(options?.live);
  const mode: EvaluationMode = isLive ? "live_pipeline" : "harness_mock";

  let liveProvider: LocalNvidiaProvider | null = null;
  let providerName = "mock";
  let modelName = "mock-nemotron";
  let endpointUrl = "mock://local";

  if (isLive) {
    if (options?.modelOverride && options.modelOverride.constructor.name === "MockReviewModel") {
      throw new Error(
        "Live evaluation invariant violated: MockReviewModel detected in live evaluation mode! Silent fallback to mocks is strictly prohibited."
      );
    }

    if (!process.env.NVIDIA_API_KEY) {
      try {
        process.loadEnvFile();
      } catch {
        // Ignore missing .env
      }
    }

    const key = process.env.NVIDIA_API_KEY;
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      throw new AuthenticationError(
        "Live evaluation requested (--live), but NVIDIA_API_KEY environment variable is not set. Silent fallback to mocks is strictly prohibited."
      );
    }

    if (options?.modelOverride) {
      if (
        options.modelOverride.constructor.name !== "LocalNvidiaProvider" &&
        !(options.modelOverride instanceof LocalNvidiaProvider)
      ) {
        throw new Error(
          `Live evaluation invariant violated: Provider ${options.modelOverride.constructor.name} is not permitted. Only NVIDIA provider is authorized for 0.1.0 release.`
        );
      }
      liveProvider = options.modelOverride as LocalNvidiaProvider;
    } else {
      liveProvider = new LocalNvidiaProvider({
        apiKey: key.trim(),
        timeoutMs: options?.timeoutMs ?? 120000,
      });
    }

    providerName = "nvidia";
    modelName = liveProvider.modelId ?? "nvidia/nemotron-3-ultra-550b-a55b";
    endpointUrl = liveProvider.endpointUrl ?? "https://integrate.api.nvidia.com/v1/chat/completions";
  }

  const startTime = Date.now();
  let fixtures = await loadGoldenFixtures(options?.fixturesDir);
  if (options?.fixtureFilter) {
    fixtures = fixtures.filter((f) => f.name.includes(options.fixtureFilter!));
  }

  const results: EvaluationResult[] = [];
  logger.info(
    { fixtureCount: fixtures.length, mode, provider: providerName, modelName, endpoint: endpointUrl },
    "Starting golden review evaluation"
  );

  let aggregateRequests = 0;
  let aggregateTimeouts = 0;

  for (const fixture of fixtures) {
    const fixtureStart = Date.now();

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let apiFailures = 0;
    let timeoutCount = 0;
    let requestCount = 0;
    const byReviewer: Record<string, number> = {};
    const reviewerSpecificFindings: Record<string, RankedFinding[]> = {};

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
        scopeType: "working-tree",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
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
    let vulnDiffLines = 0;
    let cleanDiffLines = 0;

    // Helper to setup isolated git repository with clean baseline commit
    const setupRepoWithBaseline = async (): Promise<{ dir: string; targetFilePath: string }> => {
      const dir = await fs.mkdtemp(path.join(tmpdir(), `octate-eval-${fixture.category}-`));
      await git.init({ fs, dir });
      await git.setConfig({ fs, dir, path: "user.name", value: "Evaluation Harness" });
      await git.setConfig({ fs, dir, path: "user.email", value: "eval@octate.dev" });

      const targetFilePath = path.join(dir, fixture.expected.targetFile);
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });

      const baseContent =
        fixture.baselineContent ??
        (fixture.language === "python"
          ? "# Baseline module\n"
          : fixture.language === "markdown"
            ? "# Documentation Baseline\n"
            : "// Baseline module\nexport {};\n");

      await fs.writeFile(targetFilePath, baseContent, "utf-8");
      await fs.writeFile(path.join(dir, "README.md"), `# Repo for ${fixture.name}\n`, "utf-8");
      await git.add({ fs, dir, filepath: "README.md" });
      await git.add({ fs, dir, filepath: fixture.expected.targetFile });
      await git.commit({ fs, dir, message: "Clean baseline commit" });

      return { dir, targetFilePath };
    };

    // 1. Evaluate Vulnerable Variant with Real Git Diff
    const vulnRepo = await setupRepoWithBaseline();
    try {
      await fs.writeFile(vulnRepo.targetFilePath, fixture.vulnerableContent, "utf-8");

      // Verify and record non-empty git diff (Task 6)
      const statusMatrix = await git.statusMatrix({ fs, dir: vulnRepo.dir });
      const fileStatus = statusMatrix.find((r) => r[0] === fixture.expected.targetFile);
      const isModified = fileStatus && (fileStatus[2] === 2 || fileStatus[2] === 3);
      if (!isModified) {
        throw new Error(
          `Vulnerable variant validation failed for ${fixture.name}: expected modified git diff, but status was ${JSON.stringify(fileStatus)}`
        );
      }

      const vulnLines = fixture.vulnerableContent.split("\n").length;
      const baseLines = (fixture.baselineContent ?? "").split("\n").length;
      vulnDiffLines = Math.abs(vulnLines - baseLines) + 1;

      const baseModel = isLive ? liveProvider! : createMockModelForFixture(fixture, false);
      const trackingModel = new TelemetryTrackingModel(baseModel);

      const useCase = new ReviewUseCase();
      const vulnStart = Date.now();
      try {
        vulnResult = await useCase.execute({
          repoRoot: vulnRepo.dir,
          scopeOptions: { type: "working-tree", repoRoot: vulnRepo.dir },
          modelOverride: trackingModel,
        });
      } catch (err) {
        apiFailures++;
        logger.error({ fixture: fixture.name, error: err }, "Vulnerable review execution failed");
      }
      vulnLatencyMs = Date.now() - vulnStart;

      promptTokens += vulnResult.metadata?.promptTokens ?? 0;
      completionTokens += vulnResult.metadata?.completionTokens ?? 0;
      totalTokens += vulnResult.metadata?.totalTokens ?? 0;
      requestCount += trackingModel.requestCount;
      apiFailures += trackingModel.apiFailures;
      timeoutCount += trackingModel.timeoutCount;

      for (const [rev, cnt] of Object.entries(vulnResult.summary.byReviewer ?? {})) {
        byReviewer[rev] = (byReviewer[rev] ?? 0) + cnt;
      }
      for (const call of trackingModel.reviewerCalls) {
        const role = call.role.includes("structural")
          ? "structural"
          : call.role.includes("semantic")
            ? "semantic"
            : call.role.includes("security")
              ? "security"
              : "critic";
        const findingsList = call.findings.map((f, idx) => ({
          ...f,
          id: `finding-${role}-${idx}`,
          finalRank: idx + 1,
          status: "open" as const,
        }));
        reviewerSpecificFindings[role] = (reviewerSpecificFindings[role] ?? []).concat(findingsList);
      }
    } finally {
      await fs.rm(vulnRepo.dir, { recursive: true, force: true });
    }

    // 2. Evaluate Clean Variant with Real Git Diff
    const cleanRepo = await setupRepoWithBaseline();
    try {
      await fs.writeFile(cleanRepo.targetFilePath, fixture.cleanContent, "utf-8");

      // Verify and record non-empty git diff (Task 6)
      const statusMatrix = await git.statusMatrix({ fs, dir: cleanRepo.dir });
      const fileStatus = statusMatrix.find((r) => r[0] === fixture.expected.targetFile);
      const isModified = fileStatus && (fileStatus[2] === 2 || fileStatus[2] === 3);
      if (!isModified) {
        throw new Error(
          `Clean variant validation failed for ${fixture.name}: expected modified git diff, but status was ${JSON.stringify(fileStatus)}`
        );
      }

      const cleanLines = fixture.cleanContent.split("\n").length;
      const baseLines = (fixture.baselineContent ?? "").split("\n").length;
      cleanDiffLines = Math.abs(cleanLines - baseLines) + 1;

      const baseModel = isLive ? liveProvider! : createMockModelForFixture(fixture, true);
      const trackingModel = new TelemetryTrackingModel(baseModel);

      const useCase = new ReviewUseCase();
      const cleanStart = Date.now();
      try {
        cleanResult = await useCase.execute({
          repoRoot: cleanRepo.dir,
          scopeOptions: { type: "working-tree", repoRoot: cleanRepo.dir },
          modelOverride: trackingModel,
        });
      } catch (err) {
        apiFailures++;
        logger.error({ fixture: fixture.name, error: err }, "Clean review execution failed");
      }
      cleanLatencyMs = Date.now() - cleanStart;

      promptTokens += cleanResult.metadata?.promptTokens ?? 0;
      completionTokens += cleanResult.metadata?.completionTokens ?? 0;
      totalTokens += cleanResult.metadata?.totalTokens ?? 0;
      requestCount += trackingModel.requestCount;
      apiFailures += trackingModel.apiFailures;
      timeoutCount += trackingModel.timeoutCount;
    } finally {
      await fs.rm(cleanRepo.dir, { recursive: true, force: true });
    }

    aggregateRequests += requestCount;
    aggregateTimeouts += timeoutCount;

    // 3. Compute Per-Fixture Metrics
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
      unmatchedFindings = vulnResult.findings.filter((f) => !matchesExpected(f, fixture.expected));
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
    const falsePositiveRate =
      truePositives + falsePositives > 0 ? falsePositives / (truePositives + falsePositives) : 0.0;

    const fixtureLatency = Date.now() - fixtureStart;
    const passed =
      apiFailures === 0 &&
      (hasDefect
        ? detectedExpected &&
          cleanResult.findings.length <= fixture.expected.expectedNegativeFindings &&
          falsePositives === 0
        : falsePositives === 0);

    const criticRetainedCount = vulnResult.metadata?.postCriticFindingCount ?? vulnResult.findings.length;

    results.push({
      fixtureName: fixture.name,
      category: fixture.category,
      language: fixture.language,
      mode,
      provider: providerName,
      model: modelName,
      endpoint: endpointUrl,
      detectedExpected,
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      falsePositiveRate,
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
      requestCount,
      apiFailures,
      timeoutCount,
      byReviewer,
      reviewerSpecificFindings,
      criticRetainedCount,
      vulnerableDiffLines: vulnDiffLines,
      cleanDiffLines: cleanDiffLines,
      passed,
    });
  }

  const totalDuration = Date.now() - startTime;
  return calculateScorecard(
    results,
    totalDuration,
    mode,
    providerName,
    modelName,
    endpointUrl,
    aggregateRequests,
    aggregateTimeouts
  );
}
