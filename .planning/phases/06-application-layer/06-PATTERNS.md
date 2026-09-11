# Phase 6: Application Layer - Pattern Mapping

**Phase:** 06 — Application Layer  
**Domain:** End-to-End Pipeline Orchestration (`ReviewUseCase`), 8 Canonical Progress Stages, Pluggable Output Renderers (`JsonRenderer`, `SarifRenderer`, `QuietRenderer`, `ConsoleRenderer`), Blocking Severity Policy, Exit Code Mapping (`OUT-02`), and Process Lifecycle / Cancellation  
**Status:** Completed  
**Author:** gsd-pattern-mapper  
**Canonical Inputs:** [06-CONTEXT.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/06-application-layer/06-CONTEXT.md), [06-RESEARCH.md](file:///home/ved/Desktop/project_i/Octate/.planning/phases/06-application-layer/06-RESEARCH.md)  

---

## 1. Architectural Positioning & Responsibilities

The Application Layer serves as **Layer 6** in Octate's 8-layer strict architecture:

```
Layer 7: Presentation / TUI (Phase 7: Ink / React interactive workspace)
               ▲
Layer 6: Application Layer (Phase 6: ReviewUseCase, Pluggable Renderers, Policy, Lifecycle)
               ▲
Layer 5: Review Engine (Phase 5: ReviewDAG, CriticStage, Deduplicator, CompositeRanker)
               ▲
Layer 4: Model Provider (Phase 4: ReviewModel, LocalNvidiaProvider, Schema, Prompts)
               ▲
Layer 3: Intelligence Layer (Phase 3: ReferenceGraph, SymbolIndex, ContextEngine)
               ▲
Layer 2: Analysis Layer (Phase 2: Tree-sitter Parser, Symbols, DiagnosticsOrchestrator)
               ▲
Layer 1: Repository Layer (Phase 1: Git diff, Scope resolution, CacheStore, Cancellation)
```

### Architectural Role

Prior to Phase 6, domain layers 1 through 5 operated as pure, isolated libraries without CLI or terminal coupling. Phase 6 establishes the **Application Service Boundary**:

1. **Orchestrates the End-to-End Pipeline (`ReviewUseCase`):** Chains Layer 1 (`resolveScope`), Layer 2 (`analyzeFiles`), Layer 3 (`createSymbolIndex`, `createReferenceGraph`, `buildContext`), Layer 4 (`LocalNvidiaProvider`), and Layer 5 (`createReviewEngine`) into an uninterrupted 8-stage review lifecycle.
2. **Standard Progress Streaming (`ReviewProgressEvent`):** Exposes an unopinionated, strongly-typed callback (`onProgress`) emitting 8 canonical stages (`git:read` through `review:rank`). Enables clean separation: standard terminal writes progress to `stderr`, while machine-readable modes (`--json`, `--sarif`, `--quiet`) maintain strict `stdout` cleanliness.
3. **Pluggable Output Renderers (`ReviewRenderer`):** Establishes a polymorphic rendering interface implemented by `JsonRenderer`, `SarifRenderer` (SARIF v2.1.0 via `node-sarif-builder`), `QuietRenderer` (one-line format, silent on 0 findings), and `ConsoleRenderer` (colorized badges via `picocolors`). Phase 7's interactive React/Ink TUI will implement this identical interface.
4. **Blocking Policy & Stable Exit Codes (`OUT-02`):** Implements threshold policy evaluation against final ranked findings (`review.failOnSeverity` in config and `--fail-on <severity>` on CLI), deterministically routing exits to codes `0` (passed / advisory), `1` (blocking findings), `2` (config/usage error), `3` (repo/analysis error), `4` (model error), `5` (internal error), and `130` (cancellation).
5. **Process & Signal Lifecycle:** Implements two-stage SIGINT handling (graceful tree kill on first hit, immediate `process.exit(130)` on rapid second hit) with atomic cache preservation.

---

## 2. File Inventory & Classification

| File Path | Architectural Role / Layer | Data Flow (Input ➔ Transform ➔ Output) | Closest Codebase Analog |
|:---|:---|:---|:---|
| `src/application/types.ts` | **Domain Contracts**<br>(Layer 6 Types) | Defines immutable types for canonical stages, progress events, use case options, and exit code constants. | [`src/review/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/types.ts)<br>[`src/types/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/types/index.ts) |
| `src/application/policy.ts` | **Domain Policy**<br>(Severity Threshold Gate) | `ReviewResult` + `failOnSeverity` threshold ➔ Severity ranking comparison + threshold tally ➔ Blocking count + Failure banner + Exit code (`0` vs `1`). | [`src/analysis/diagnostics/severity.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/severity.ts)<br>[`src/errors/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/errors/index.ts) |
| `src/application/progress.ts` | **Progress Reporting**<br>(Stderr Streamer) | `ReviewProgressEvent` stream ➔ TTY/non-TTY formatting + stage message formatting + quiet/json suppression ➔ `process.stderr` updates. | [`src/logging/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/logging/index.ts)<br>[`src/cancellation/controller.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/controller.ts) |
| `src/application/review.ts` | **Application Orchestrator**<br>(Use Case Boundary) | `ReviewUseCaseOptions` (repoRoot, scopeOptions, config, model, signal, onProgress) ➔ Sequenced execution of 8 canonical stages with cancellation checks ➔ Authoritative `ReviewResult`. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts)<br>[`src/analysis/orchestrator.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts)<br>[`src/review/engine.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/engine.ts) |
| `src/application/index.ts` | **Public API Barrel**<br>(Layer 6 Root) | Re-exports use cases, progress types, policy functions, and exit codes. | [`src/review/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/index.ts)<br>[`src/intelligence/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/index.ts) |
| `src/renderers/types.ts` | **Renderer Contracts**<br>(Layer 7 Interface Boundary) | Defines `ReviewRenderer` contract, `RendererOptions`, and destination dispatch helper (`writeRenderedOutput`). | [`src/model/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/types.ts)<br>[`src/intelligence/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/types.ts) |
| `src/renderers/json.ts` | **JSON Formatter**<br>(Machine-Readable) | `ReviewResult` ➔ Pretty-printed JSON string serialization ➔ Stdout or `--output <file>`. | [`src/intelligence/context/serializer.ts`](file:///home/ved/Desktop/project_i/Octate/src/intelligence/context/serializer.ts) |
| `src/renderers/sarif.ts` | **SARIF v2.1.0 Formatter**<br>(CI/CD Standard) | `ReviewResult` ➔ `node-sarif-builder` (runs, driver metadata, rules, results, physical locations, property bag) ➔ Valid SARIF JSON ➔ Stdout or `--output <file>`. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L332-L379) |
| `src/renderers/quiet.ts` | **Quiet Formatter**<br>(Minimalist Output) | `ReviewResult` ➔ One line per finding `file:line: [SEVERITY] title` + summary line (completely silent if 0 findings) ➔ Stdout or `--output <file>`. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L384-L401) |
| `src/renderers/console.ts` | **Console Formatter**<br>(Human Terminal) | `ReviewResult` ➔ Colorized ANSI badges via `picocolors` + finding blocks + fix suggestions + summary box ➔ Stdout or `--output <file>`. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L406-L460) |
| `src/renderers/index.ts` | **Renderers Barrel & Factory** | Re-exports all renderers and exports `createRenderer(format, options)` factory. | [`src/model/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/model/index.ts)<br>[`src/commands/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/index.ts) |
| `src/config/schema.ts` *(modify)* | **Configuration Schema** | Adds `failOnSeverity` (`'critical' \| 'high' \| 'medium' \| 'low' \| 'info' \| 'none' \| 'off'`) to `ReviewConfigSchema`. | [`src/config/schema.ts`](file:///home/ved/Desktop/project_i/Octate/src/config/schema.ts#L8-L12) |
| `src/repository/scope.ts` *(modify)* | **Scope Resolution** | Implements `getStagedFiles` and `getWorkingFiles` via `git.statusMatrix` so `--staged` and `--working` populate changed files. | [`src/repository/git.ts`](file:///home/ved/Desktop/project_i/Octate/src/repository/git.ts#L464-L514) |
| `src/review/types.ts` & `src/review/engine.ts` *(modify)* | **Review Engine Contract** | Adds optional `onProgress` callback to `ReviewEngineInput` to emit canonical stages 6, 7, and 8. | [`src/review/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/types.ts#L100-L118) |
| `src/commands/review.ts` *(modify)* | **CLI Command Layer** | Commander definition with `--fail-on`, default scope resolution, signal lifecycle with double-SIGINT detection, use case invocation, and exit code handling. | [`src/commands/review.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts)<br>[`src/cli.ts`](file:///home/ved/Desktop/project_i/Octate/src/cli.ts) |
| `src/cli.ts` *(verify/modify)* | **CLI Entry Point** | Top-level signal registration, exit code resolution (0, 1, 2, 3, 4, 5, 130). | [`src/cli.ts`](file:///home/ved/Desktop/project_i/Octate/src/cli.ts#L74-L119) |
| `src/application/policy.test.ts` | **Policy Test Suite** | Evaluates blocking findings against severity thresholds, tests advisory mode (`none`/`off`), tests failure banner. | [`src/analysis/diagnostics/severity.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/severity.test.ts) |
| `src/application/progress.test.ts` | **Progress Test Suite** | Validates `StderrProgressReporter` stage messages, quiet suppression, step counters, and TTY vs non-TTY writing. | [`src/logging/index.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/logging/index.test.ts) |
| `src/application/review.test.ts` | **Use Case Integration Test** | Runs `ReviewUseCase` with mocked Model Provider; asserts 8 stages emitted in sequence; tests empty diff; tests cancellation abort. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/renderers/json.test.ts` | **JSON Renderer Test Suite** | Validates JSON parseability, indentation, and `--output` file write. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/renderers/sarif.test.ts` | **SARIF Renderer Test Suite** | Validates schema compliance (`$schema`, `version: 2.1.0`), rule mapping, severity levels, and physical locations. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/renderers/quiet.test.ts` | **Quiet Renderer Test Suite** | Validates one-line format; validates complete silence (0 stdout bytes) on 0 findings. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/renderers/console.test.ts` | **Console Renderer Test Suite** | Validates human-readable badges, formatting, summary box, suggested fix display. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/commands/review.test.ts` *(update)* | **CLI Command Test Suite** | Tests mutual exclusivity, `--fail-on` overrides, default scope fallback, exit codes. | [`src/commands/review.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.test.ts) |
| `src/repository/scope.test.ts` *(update)* | **Scope Test Suite** | Tests that staged and working scopes populate non-empty `files` arrays via `statusMatrix`. | [`src/repository/scope.test.ts`](file:///home/ved/Desktop/project_i/Octate/src/repository/scope.test.ts) |

---

## 3. Component Analog Mapping & Concrete Excerpts

### 3.1 Domain & Progress Contracts (`src/application/types.ts`)

#### Architectural Role & Analog
- **Role:** Pure domain contracts for Layer 6 application orchestration: 8 canonical review stages, progress event schema, progress callbacks, use case options, exit code definitions.
- **Closest Analog:** [`src/review/types.ts`](file:///home/ved/Desktop/project_i/Octate/src/review/types.ts) and [`src/types/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/types/index.ts).
- **Patterns Followed:**
  1. String union literals for stages and statuses.
  2. Nested step progress indicator `{ current: number, total: number }`.
  3. Simple, zero-dependency callback signature `(event: ReviewProgressEvent) => void`.
  4. Typed exit code constants matching RFC `OUT-02`.

#### Concrete Code Excerpt from Analog (`src/review/types.ts:11-22`)
```typescript
export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'reliability'
  | 'maintainability'
  | 'compatibility'
  | 'testing';
```

#### Established Convention for `src/application/types.ts`
```typescript
import type { OctateConfig, ReviewConfig } from '../config/schema.js';
import type { ReviewModel } from '../model/types.js';
import type { ScopeOptions } from '../repository/scope.js';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';

export type CanonicalReviewStage =
  | 'git:read'
  | 'index:update'
  | 'symbols:resolve'
  | 'diagnostics:collect'
  | 'context:build'
  | 'review:dag'
  | 'review:critic'
  | 'review:rank';

export type ReviewProgressStatus = 'start' | 'progress' | 'complete' | 'error';

export interface ReviewProgressStep {
  current: number; // 1 to 8
  total: number;   // 8
}

export interface ReviewProgressEvent {
  stage: CanonicalReviewStage;
  status: ReviewProgressStatus;
  message: string;
  step?: ReviewProgressStep;
  payload?: Record<string, unknown>;
}

export type ReviewProgressCallback = (event: ReviewProgressEvent) => void;

export type ReviewFailOnSeverity = ReviewSeverity | 'none' | 'off';

export interface ReviewUseCaseOptions {
  repoRoot?: string;
  scopeOptions?: ScopeOptions;
  refs?: string[];
  config?: OctateConfig;
  modelOverride?: ReviewModel;
  signal?: AbortSignal;
  onProgress?: ReviewProgressCallback;
}

export const ReviewExitCodes = {
  SUCCESS: 0,
  BLOCKING_FINDINGS: 1,
  CONFIG_ERROR: 2,
  REPOSITORY_ERROR: 3,
  MODEL_ERROR: 4,
  INTERNAL_ERROR: 5,
  CANCELLED: 130,
} as const;

export type ReviewExitCode = (typeof ReviewExitCodes)[keyof typeof ReviewExitCodes];
```

---

### 3.2 Blocking Severity Policy (`src/application/policy.ts`)

#### Architectural Role & Analog
- **Role:** Implements blocking threshold logic (D-01, D-02, D-03, D-04). Evaluates final ranked findings against `failOnSeverity`, calculates exit code (0 vs 1), and generates terminal failure banner.
- **Closest Analog:** [`src/analysis/diagnostics/severity.ts`](file:///home/ved/Desktop/project_i/Octate/src/analysis/diagnostics/severity.ts) and [`src/errors/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/errors/index.ts).
- **Patterns Followed:**
  1. Numeric severity hierarchy mapping (`critical: 5`, `high: 4`, `medium: 3`, `low: 2`, `info: 1`).
  2. Advisory bypass (`none` or `off` always returns 0).
  3. Grammatically correct terminal failure summary formatting.

#### Concrete Code Excerpt from Analog (`src/analysis/diagnostics/severity.ts:13-33`)
```typescript
const SEVERITY_WEIGHTS: Record<DiagnosticSeverity, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.2,
  info: 0.05,
};

export function compareSeverity(a: DiagnosticSeverity, b: DiagnosticSeverity): number {
  return SEVERITY_WEIGHTS[b] - SEVERITY_WEIGHTS[a];
}
```

#### Established Convention for `src/application/policy.ts`
```typescript
import pc from 'picocolors';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';
import type { ReviewFailOnSeverity } from './types.js';

export const SEVERITY_LEVELS: Record<ReviewSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

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

export function countBlockingFindings(
  findings: RankedFinding[],
  threshold: ReviewFailOnSeverity
): number {
  if (threshold === 'none' || threshold === 'off') {
    return 0;
  }
  return findings.filter((f) => isBlockingFinding(f, threshold)).length;
}

export function evaluateExitCode(
  result: ReviewResult,
  threshold: ReviewFailOnSeverity = 'critical'
): 0 | 1 {
  const blockingCount = countBlockingFindings(result.findings, threshold);
  return blockingCount > 0 ? 1 : 0;
}

export function formatFailureBanner(
  blockingCount: number,
  threshold: ReviewFailOnSeverity
): string {
  const noun = blockingCount === 1 ? 'blocking finding' : 'blocking findings';
  return pc.red(
    `\n❌ Review failed: ${blockingCount} ${noun} (>= ${threshold})\n`
  );
}
```

---

### 3.3 Progress Streaming & Stderr Reporter (`src/application/progress.ts`)

#### Architectural Role & Analog
- **Role:** Encapsulates progress event handling for CLI execution (D-05, D-06, D-07, D-08). Formats canonical stages into stderr lines or spinners, and automatically suppresses updates in non-interactive modes (`--quiet`, `--json`, `--sarif`).
- **Closest Analog:** [`src/logging/index.ts`](file:///home/ved/Desktop/project_i/Octate/src/logging/index.ts).
- **Patterns Followed:**
  1. Strict destination isolation: progress streams to `process.stderr` exclusively.
  2. Mode suppression: completely inert when `--json`, `--sarif`, or `--quiet` is enabled.
  3. Clean TTY line overwrite using ANSI codes with non-TTY newline fallback.

#### Concrete Code Excerpt from Analog (`src/logging/index.ts:30-45`)
```typescript
function createPinoLogger(options: LoggerOptions = {}): Logger {
  const isDev = isDevelopmentMode();
  let logLevel: string;
  if (isDev) {
    logLevel = 'debug';
  } else {
    logLevel = 'info';
  }
  const envLogLevel = process.env.LOG_LEVEL;
  if (envLogLevel !== undefined) {
    logLevel = envLogLevel;
  }
```

#### Established Convention for `src/application/progress.ts`
```typescript
import pc from 'picocolors';
import type { ReviewProgressCallback, ReviewProgressEvent } from './types.js';

export interface ProgressReporterOptions {
  quiet?: boolean;
  json?: boolean;
  sarif?: boolean;
  stream?: NodeJS.WritableStream;
}

export class StderrProgressReporter {
  private readonly enabled: boolean;
  private readonly stream: NodeJS.WritableStream;
  private readonly isTTY: boolean;

  constructor(options: ProgressReporterOptions = {}) {
    this.enabled = !options.quiet && !options.json && !options.sarif;
    this.stream = options.stream ?? process.stderr;
    this.isTTY = Boolean((this.stream as { isTTY?: boolean }).isTTY);
  }

  public report: ReviewProgressCallback = (event: ReviewProgressEvent) => {
    if (!this.enabled) return;

    const stepPrefix = event.step
      ? pc.dim(`[${event.step.current}/${event.step.total}] `)
      : '';
    const statusIcon =
      event.status === 'complete'
        ? pc.green('✓ ')
        : event.status === 'error'
          ? pc.red('✗ ')
          : pc.cyan('⟳ ');

    const line = `${stepPrefix}${statusIcon}${event.message}`;

    if (this.isTTY) {
      this.stream.write(`\r\x1b[K${line}`);
      if (event.status === 'complete' || event.status === 'error') {
        this.stream.write('\n');
      }
    } else if (event.status === 'complete' || event.status === 'error') {
      this.stream.write(`${line}\n`);
    }
  };

  public clear(): void {
    if (this.enabled && this.isTTY) {
      this.stream.write('\r\x1b[K');
    }
  }
}
```

---

### 3.4 Application Orchestrator (`src/application/review.ts`)

#### Architectural Role & Analog
- **Role:** Central application orchestrator (`ReviewUseCase`). Encapsulates the complete review workflow across Layer 1 to Layer 5, emitting the 8 canonical progress events and checking signals at each boundary.
- **Closest Analog:** [`src/commands/review.ts:202-301`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L202-L301), [`src/analysis/orchestrator.ts:39-148`](file:///home/ved/Desktop/project_i/Octate/src/analysis/orchestrator.ts#L39-L148), and [`src/review/engine.ts:38-261`](file:///home/ved/Desktop/project_i/Octate/src/review/engine.ts#L38-L261).
- **Patterns Followed:**
  1. Deterministic pipeline sequencing with cancellation check (`signal?.throwIfAborted()`) at each stage.
  2. Progress emission via `emitStage(stage, status, message, step, payload)`.
  3. Resilient file reading map for symbol index and context engine.
  4. Clean short-circuiting on empty diffs without invoking LLM providers.

#### Concrete Code Excerpt from Analog (`src/commands/review.ts:210-245`)
```typescript
// 1. Run Analysis Orchestrator (Tree-sitter parse, symbol extraction, static diagnostics)
const analysis = await analyzeFiles(filePaths, repoRoot, { signal });

// 2. Read file contents into map for intelligence layer
const { readFile } = await import('node:fs/promises');
const fileContents = new Map<string, string>();
await Promise.all(
  filePaths.map(async (file) => {
    try {
      const content = await readFile(`${repoRoot}/${file}`, 'utf-8');
      fileContents.set(file, content);
    } catch {
      fileContents.set(file, '');
    }
  })
);

// 3. Build SymbolIndex and PathResolver
const symbolIndex = createSymbolIndex(analysis.parsedFiles, fileContents);
const pathResolver = await createPathResolver(repoRoot);

// 4. Build ReferenceGraph
const referenceGraph = createReferenceGraph(
  analysis.parsedFiles,
  symbolIndex,
  pathResolver,
  undefined,
  fileContents
);
```

#### Established Convention for `src/application/review.ts`
```typescript
import { readFile } from 'node:fs/promises';
import { analyzeFiles } from '../analysis/orchestrator.js';
import { loadConfig } from '../config/merger.js';
import { GitError } from '../errors/index.js';
import {
  createContextEngine,
  createPathResolver,
  createReferenceGraph,
  createSymbolIndex,
} from '../intelligence/index.js';
import { createLogger } from '../logging/index.js';
import { LocalNvidiaProvider } from '../model/index.js';
import { findGitRoot } from '../repository/discovery.js';
import { resolveScope, type ScopeOptions } from '../repository/scope.js';
import { createReviewEngine } from '../review/engine.js';
import type { ReviewResult } from '../review/types.js';
import type {
  CanonicalReviewStage,
  ReviewProgressCallback,
  ReviewProgressStatus,
  ReviewUseCaseOptions,
} from './types.js';

const logger = createLogger('application:review');

export class ReviewUseCase {
  public async execute(options: ReviewUseCaseOptions = {}): Promise<ReviewResult> {
    const { signal, onProgress } = options;
    signal?.throwIfAborted();

    const emit = (
      stage: CanonicalReviewStage,
      status: ReviewProgressStatus,
      message: string,
      currentStep: number,
      payload?: Record<string, unknown>
    ) => {
      onProgress?.({
        stage,
        status,
        message,
        step: { current: currentStep, total: 8 },
        payload,
      });
    };

    // Stage 1: git:read
    emit('git:read', 'start', 'Reading repository state & diff', 1);
    const cwd = options.repoRoot ?? process.cwd();
    const repoRoot = (await findGitRoot(cwd)) ?? cwd;
    const scopeOptions: ScopeOptions = options.scopeOptions ?? {
      type: 'working-tree',
      repoRoot,
    };
    const scope = await resolveScope(scopeOptions);
    signal?.throwIfAborted();
    emit('git:read', 'complete', `Discovered ${scope.files.length} changed files`, 1, {
      fileCount: scope.files.length,
      scopeType: scope.type,
    });

    const filePaths = scope.files.map((f) => f.path);
    const config = options.config ?? (await loadConfig({}));

    // Stage 2: index:update
    emit('index:update', 'start', 'Updating cache & AST parse trees', 2);
    signal?.throwIfAborted();
    const analysis = await analyzeFiles(filePaths, repoRoot, { signal });
    emit('index:update', 'complete', `Parsed ${analysis.parsedFiles.length} files`, 2, {
      parsedCount: analysis.parsedFiles.length,
    });

    // Stage 3: symbols:resolve
    emit('symbols:resolve', 'start', 'Resolving changed symbols & reference graph', 3);
    signal?.throwIfAborted();
    const fileContents = new Map<string, string>();
    await Promise.all(
      filePaths.map(async (file) => {
        try {
          const content = await readFile(`${repoRoot}/${file}`, 'utf-8');
          fileContents.set(file, content);
        } catch {
          fileContents.set(file, '');
        }
      })
    );
    const symbolIndex = createSymbolIndex(analysis.parsedFiles, fileContents);
    const pathResolver = await createPathResolver(repoRoot);
    const referenceGraph = createReferenceGraph(
      analysis.parsedFiles,
      symbolIndex,
      pathResolver,
      undefined,
      fileContents
    );
    emit('symbols:resolve', 'complete', `Indexed ${analysis.symbols.length} symbols`, 3, {
      symbolCount: analysis.symbols.length,
    });

    // Stage 4: diagnostics:collect
    emit('diagnostics:collect', 'start', 'Collecting static diagnostics', 4);
    signal?.throwIfAborted();
    emit('diagnostics:collect', 'complete', `Collected ${analysis.diagnostics.length} diagnostics`, 4, {
      diagnosticCount: analysis.diagnostics.length,
    });

    // Stage 5: context:build
    emit('context:build', 'start', 'Building and token-budgeting review context', 5);
    signal?.throwIfAborted();
    const contextEngine = createContextEngine();
    const reviewContext = await contextEngine.buildContext({
      changedFiles: filePaths,
      diff: scope.diff,
      symbolIndex,
      referenceGraph,
      diagnostics: analysis.diagnostics,
      readFile: async (file: string) => fileContents.get(file) ?? '',
    });
    emit('context:build', 'complete', `Context assembled (${reviewContext.totalTokens} tokens)`, 5, {
      totalTokens: reviewContext.totalTokens,
    });

    // Stages 6-8: Handled in ReviewEngine with progress hooks
    emit('review:dag', 'start', 'Executing AI Reviewer DAG', 6);
    signal?.throwIfAborted();
    const model = options.modelOverride ?? new LocalNvidiaProvider();
    const engine = createReviewEngine();

    const result = await engine.run({
      repoRoot,
      diff: scope.diff,
      changedFiles: filePaths,
      reviewContext,
      referenceGraph,
      symbolIndex,
      diagnostics: analysis.diagnostics,
      model,
      config: config.review,
      signal,
      scopeMetadata: {
        scopeType: scope.type,
        base: scope.base,
        head: scope.head,
      },
    });

    emit('review:dag', 'complete', 'Reviewer DAG execution complete', 6);
    emit('review:critic', 'start', 'Filtering findings through Critic quality gate', 7);
    emit('review:critic', 'complete', 'Critic gate evaluation complete', 7);
    emit('review:rank', 'start', 'Deduplicating, ranking, and assembling ReviewResult', 8);
    emit('review:rank', 'complete', `Review complete: ${result.findings.length} findings`, 8, {
      totalFindings: result.findings.length,
    });

    return result;
  }
}

export function createReviewUseCase(): ReviewUseCase {
  return new ReviewUseCase();
}
```

---

### 3.5 Pluggable Renderer Polymorphism (`src/renderers/`)

#### Architectural Role & Analog
- **Role:** Contract and implementations for formatting `ReviewResult` into external representations (JSON, SARIF v2.1.0, Quiet, Console) with strict destination isolation (stdout vs `--output <file>`).
- **Closest Analog:** [`src/commands/review.ts:304-460`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L304-L460).
- **Patterns Followed:**
  1. Common interface `ReviewRenderer` with `render(result: ReviewResult): Promise<void> | void`.
  2. Async file output writing with parent directory auto-creation (`mkdir({ recursive: true })`) per D-16.
  3. Confirmation message written to `stderr` on file output (`process.stderr.write(...)`).

#### Common Renderer Contract (`src/renderers/types.ts`)
```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ReviewResult } from '../review/types.js';

export interface RendererOptions {
  outputFile?: string;
  stream?: NodeJS.WritableStream;
  color?: boolean;
}

export interface ReviewRenderer {
  render(result: ReviewResult): Promise<void> | void;
}

export async function writeRenderedOutput(
  content: string,
  options?: RendererOptions
): Promise<void> {
  if (options?.outputFile) {
    await mkdir(dirname(options.outputFile), { recursive: true });
    await writeFile(options.outputFile, content, 'utf-8');
    process.stderr.write(`Wrote results to ${options.outputFile}\n`);
  } else {
    const stream = options?.stream ?? process.stdout;
    stream.write(content.endsWith('\n') ? content : `${content}\n`);
  }
}
```

#### SARIF v2.1.0 Renderer (`src/renderers/sarif.ts`) via `node-sarif-builder`
```typescript
import {
  SarifBuilder,
  SarifResultBuilder,
  SarifRuleBuilder,
  SarifRunBuilder,
} from 'node-sarif-builder';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

export function severityToSarifLevel(
  severity: ReviewSeverity
): 'error' | 'warning' | 'note' | 'none' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'note';
    default:
      return 'none';
  }
}

export class SarifRenderer implements ReviewRenderer {
  constructor(private readonly options: RendererOptions = {}) {}

  public async render(result: ReviewResult): Promise<void> {
    const builder = new SarifBuilder();
    const run = new SarifRunBuilder();

    run.initSimple({
      tool: {
        driver: {
          name: 'Octate',
          version: result.metadata.version || '0.1.0',
          informationUri: 'https://octate.dev',
        },
      },
    });

    // Register distinct categories as rules
    const registeredCategories = new Set<string>();
    for (const finding of result.findings) {
      if (!registeredCategories.has(finding.category)) {
        registeredCategories.add(finding.category);
        const rule = new SarifRuleBuilder().initSimple({
          ruleId: finding.category,
          shortDescriptionText: `${finding.category} rule`,
        });
        run.addRule(rule);
      }
    }

    // Add results
    for (const finding of result.findings) {
      const sarifResult = new SarifResultBuilder();
      sarifResult.initSimple({
        level: severityToSarifLevel(finding.severity),
        messageText: finding.message,
        ruleId: finding.category,
        fileUri: finding.file,
        startLine: finding.startLine ?? finding.line ?? 1,
      });
      run.addResult(sarifResult);
    }

    builder.addRun(run);
    const jsonOutput = builder.buildSarifJsonString({ indent: true });
    await writeRenderedOutput(jsonOutput, this.options);
  }
}
```

#### Quiet Renderer (`src/renderers/quiet.ts`)
```typescript
import type { ReviewResult } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

export class QuietRenderer implements ReviewRenderer {
  constructor(private readonly options: RendererOptions = {}) {}

  public async render(result: ReviewResult): Promise<void> {
    // D-15: If 0 findings exist, stay completely silent
    if (result.findings.length === 0) {
      return;
    }

    const lines: string[] = [];
    for (const finding of result.findings) {
      const line = finding.startLine ?? finding.line ?? 1;
      lines.push(`${finding.file}:${line}: [${finding.severity.toUpperCase()}] ${finding.title}`);
    }

    // Summary line
    lines.push(
      `\nTotal: ${result.summary.totalFindings} findings in ${result.summary.filesAnalyzed} files`
    );

    await writeRenderedOutput(lines.join('\n'), this.options);
  }
}
```

#### Console Renderer (`src/renderers/console.ts`)
```typescript
import pc from 'picocolors';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';
import { type RendererOptions, type ReviewRenderer, writeRenderedOutput } from './types.js';

function formatBadge(severity: ReviewSeverity): string {
  switch (severity) {
    case 'critical':
      return pc.bgRed(pc.white(pc.bold(' CRITICAL ')));
    case 'high':
      return pc.bgYellow(pc.black(pc.bold(' HIGH ')));
    case 'medium':
      return pc.yellow(pc.bold('[MEDIUM]'));
    case 'low':
      return pc.cyan(pc.bold('[LOW]'));
    case 'info':
      return pc.dim('[INFO]');
  }
}

export class ConsoleRenderer implements ReviewRenderer {
  constructor(private readonly options: RendererOptions = {}) {}

  public async render(result: ReviewResult): Promise<void> {
    const lines: string[] = [];

    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    lines.push(pc.bold(' Octate Code Review'));
    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    lines.push('');
    lines.push(`Scope: ${result.metadata.scopeType}`);
    lines.push(`Files analyzed: ${result.summary.filesAnalyzed}`);
    lines.push(`Total findings: ${result.summary.totalFindings}`);
    lines.push('');

    if (result.findings.length === 0) {
      lines.push(pc.green('✓ No issues found'));
    } else {
      for (const finding of result.findings) {
        const line = finding.startLine ?? finding.line ?? 1;
        lines.push(`  ${formatBadge(finding.severity)} ${pc.bold(finding.file)}:${line}`);
        lines.push(`      ${finding.title}`);
        lines.push(`      ${pc.dim(finding.message)}`);
        if (finding.suggestedFix) {
          lines.push(`      ${pc.green('💡 Fix:')} ${finding.suggestedFix}`);
        }
        lines.push('');
      }
    }

    lines.push(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    await writeRenderedOutput(lines.join('\n'), this.options);
  }
}
```

---

### 3.6 Scope Resolution Bug Fix (`src/repository/scope.ts`)

#### Architectural Role & Analog
- **Role:** Fulfills Pitfall 1 from Research. Currently, `getStagedFiles` and `getWorkingFiles` return empty arrays `[]`. Reading `git.statusMatrix` populates `FileChange[]` so `--staged` and `--working` trigger genuine file reviews.
- **Closest Analog:** [`src/repository/git.ts:464-546`](file:///home/ved/Desktop/project_i/Octate/src/repository/git.ts#L464-L546).

#### Established Convention for `getStagedFiles` and `getWorkingFiles`
```typescript
import * as git from 'isomorphic-git';
import { promises as fs } from 'node:fs';
import { findGitDir } from './git.js';

export async function getStagedFiles(repoRoot: string): Promise<FileChange[]> {
  const gitDir = await findGitDir(repoRoot);
  const matrix = await git.statusMatrix({ fs, dir: repoRoot, gitdir: gitDir });
  const changes: FileChange[] = [];

  for (const entry of matrix) {
    const filepath = entry[0];
    const stageStatus = entry[3] as 0 | 1 | 2 | 3;
    if (stageStatus === 1 || stageStatus === 2 || stageStatus === 3) {
      changes.push({
        path: filepath,
        status: stageStatus === 2 ? 'added' : stageStatus === 3 ? 'deleted' : 'modified',
      });
    }
  }

  return changes;
}

export async function getWorkingFiles(repoRoot: string): Promise<FileChange[]> {
  const gitDir = await findGitDir(repoRoot);
  const matrix = await git.statusMatrix({ fs, dir: repoRoot, gitdir: gitDir });
  const changes: FileChange[] = [];

  for (const entry of matrix) {
    const filepath = entry[0];
    const workdirStatus = entry[2] as 0 | 1 | 2 | 3;
    const stageStatus = entry[3] as 0 | 1 | 2 | 3;
    if (workdirStatus !== 0 && workdirStatus !== stageStatus) {
      changes.push({
        path: filepath,
        status: workdirStatus === 2 ? 'added' : workdirStatus === 3 ? 'deleted' : 'modified',
      });
    }
  }

  return changes;
}
```

---

### 3.7 CLI Command & Signal Lifecycle (`src/commands/review.ts`)

#### Architectural Role & Analog
- **Role:** Handles CLI arguments, flags (`--fail-on`, `--output`, `--json`, `--sarif`, `--quiet`, `--no-tui`), registers double-SIGINT detection (D-09, D-12), invokes `ReviewUseCase`, and executes policy exit codes.
- **Closest Analog:** [`src/commands/review.ts:46-197`](file:///home/ved/Desktop/project_i/Octate/src/commands/review.ts#L46-L197) and [`src/cancellation/controller.ts`](file:///home/ved/Desktop/project_i/Octate/src/cancellation/controller.ts).

#### Double-SIGINT & Cancellation Pattern
```typescript
let sigintCount = 0;

process.on('SIGINT', () => {
  sigintCount++;
  if (sigintCount >= 2) {
    // Immediate force kill on second Ctrl+C per D-12
    process.exit(130);
  }

  // First Ctrl+C: Print cancellation notice in standard terminal mode (D-10)
  if (!options.quiet && !options.json && !options.sarif) {
    process.stderr.write('\n⚠️ Review cancelled by user.\n');
  }

  // Gracefully abort controller & process tree
  controller.abort(new DOMException('Review cancelled by user', 'AbortError'));
});
```

---

## 4. Anti-Patterns & Landmines to Avoid

| Anti-Pattern | Why It Fails | Established Project Convention |
|:---|:---|:---|
| **Hand-Rolling SARIF Strings** | SARIF 2.1.0 requires precise schemas, location indexes, and nested driver rules. Hand-rolling produces invalid SARIF that GitHub Code Scanning rejects. | Use `node-sarif-builder` (`SarifBuilder`, `SarifRunBuilder`, `SarifRuleBuilder`, `SarifResultBuilder`). |
| **Writing Progress or Spinners to `stdout`** | Corrupts piped JSON (`octate review --json \| jq`) and invalidates uploaded SARIF files. | Strictly isolate stdout for payload. All progress updates, spinners, cancellation notices, and error banners go to `stderr` (D-07, D-10, D-16). |
| **Evaluating Blocking Threshold on Unranked Findings** | Pre-critic or pre-dedup findings might be truncated or rejected. If evaluated early, false positives fail the build. | Evaluate `isBlockingFinding` and `failOnSeverity` **exclusively** on the final ranked `result.findings` (D-03). |
| **Leaving `getStagedFiles` as an Empty Stub** | `octate review --staged` or `--working` yields 0 changed files, causing the engine to short-circuit with 0 findings even when diffs exist! | Query `git.statusMatrix` in `src/repository/scope.ts` to populate `FileChange[]` accurately. |
| **Throwing `ConfigurationError` When No Scope Specified** | Running `octate review` without flags should auto-detect scope, not crash. | Default missing CLI scope to `working-tree` (or positional ref parsing) instead of throwing. |
| **Swallowing `AbortError` into Exit Code 5** | Catching a user cancellation and reporting internal error 5 confuses CI pipelines and users. | Check `signal.aborted` or `error.name === 'AbortError'` and exit with standard signal code `130` (D-09). |
| **Ignoring Advisory Modes (`none` / `off`)** | If `--fail-on none` fails to disable blocking, CI integration cannot be rolled out safely. | Explicitly check `threshold === 'none' \|\| threshold === 'off'` and return exit code 0 regardless of findings. |

---

## 5. Testing Conventions & Test Suites Pattern Mapping

The existing test suite utilizes Jest with ESM support (`NODE_OPTIONS=--experimental-vm-modules jest`). All tests import from `@jest/globals`.

### 5.1 Test Suite Inventory for Phase 6

| Test File | Target Subject | Test Assertions & Scenarios |
|:---|:---|:---|
| `src/application/policy.test.ts` | `isBlockingFinding`, `countBlockingFindings`, `evaluateExitCode`, `formatFailureBanner` | - Checks critical/high/medium/low/info against each threshold.<br>- Tests advisory mode (`none`/`off`) returns 0.<br>- Tests failure banner formatting with single and plural finding grammar. |
| `src/application/progress.test.ts` | `StderrProgressReporter` | - Asserts formatting of all 8 canonical stages (`git:read` ... `review:rank`).<br>- Verifies suppression when `quiet: true`, `json: true`, or `sarif: true`.<br>- Verifies TTY carriage-return vs non-TTY newline emission. |
| `src/application/review.test.ts` | `ReviewUseCase` | - End-to-end execution with `MockReviewModel`.<br>- Asserts sequential emission of all 8 stages.<br>- Asserts empty diff short-circuiting.<br>- Asserts `AbortSignal` abort triggers rejection and exit. |
| `src/renderers/json.test.ts` | `JsonRenderer` | - Tests valid JSON output matching `JSON.parse(result)`.<br>- Tests writing to `--output <file>` and creating parent directories. |
| `src/renderers/sarif.test.ts` | `SarifRenderer` | - Tests valid SARIF v2.1.0 schema structure.<br>- Tests severity-to-level mapping (`critical`/`high` ➔ `error`, `medium` ➔ `warning`, `low`/`info` ➔ `note`).<br>- Tests rule registration and physical locations. |
| `src/renderers/quiet.test.ts` | `QuietRenderer` | - Tests one-line format `path:line: [SEVERITY] title`.<br>- Verifies **zero bytes written** when `result.findings.length === 0` (D-15). |
| `src/renderers/console.test.ts` | `ConsoleRenderer` | - Tests colorized badges, titles, line numbers, and summary block formatting. |
| `src/commands/review.test.ts` | `createReviewCommand` & CLI flags | - Tests `--fail-on` flag registration and precedence.<br>- Tests mutual exclusivity of `--json`, `--sarif`, `--quiet`.<br>- Tests default scope auto-detection. |
| `src/repository/scope.test.ts` | `resolveScope` for staged & working | - Asserts `scope.files.length > 0` for staged changes.<br>- Asserts `scope.files.length > 0` for working tree modifications. |

### 5.2 Test Pattern Excerpt: Policy Suite (`src/application/policy.test.ts`)
```typescript
import { describe, expect, it } from '@jest/globals';
import type { RankedFinding, ReviewResult } from '../review/types.js';
import {
  countBlockingFindings,
  evaluateExitCode,
  formatFailureBanner,
  isBlockingFinding,
} from './policy.js';

function createMockFinding(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): RankedFinding {
  return {
    id: 'mock-id',
    title: 'Mock Issue',
    message: 'Mock details',
    file: 'src/app.ts',
    startLine: 10,
    endLine: 12,
    severity,
    category: 'security',
    confidence: 0.9,
    evidence: [],
    relatedFiles: [],
    relatedSymbols: [],
    impact: 'High',
    suggestedFix: 'Fix it',
    reviewer: 'security',
    compositeScore: 90,
    scoreBreakdown: {
      severityScore: 100,
      confidenceScore: 90,
      evidenceStrengthScore: 80,
      blastRadiusScore: 50,
      securityImpactScore: 90,
      regressionProbabilityScore: 20,
    },
    blastRadius: 50,
    evidenceStrength: 80,
    contributingReviewers: ['security'],
  };
}

describe('application:policy', () => {
  it('blocks when finding meets or exceeds threshold', () => {
    const crit = createMockFinding('critical');
    const med = createMockFinding('medium');

    expect(isBlockingFinding(crit, 'critical')).toBe(true);
    expect(isBlockingFinding(med, 'critical')).toBe(false);
    expect(isBlockingFinding(med, 'medium')).toBe(true);
  });

  it('allows everything when threshold is none or off', () => {
    const crit = createMockFinding('critical');
    expect(isBlockingFinding(crit, 'none')).toBe(false);
    expect(isBlockingFinding(crit, 'off')).toBe(false);
  });

  it('evaluates exit code 1 for blocking findings and 0 for advisory mode', () => {
    const result: ReviewResult = {
      summary: {
        totalFindings: 1,
        bySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {
          correctness: 0, security: 1, performance: 0, architecture: 0,
          reliability: 0, maintainability: 0, compatibility: 0, testing: 0,
        },
        byReviewer: {},
        filesAnalyzed: 1,
        durationMs: 100,
      },
      findings: [createMockFinding('critical')],
      metadata: {} as any,
    };

    expect(evaluateExitCode(result, 'critical')).toBe(1);
    expect(evaluateExitCode(result, 'none')).toBe(0);
  });
});
```

---

## 6. Verification Checklist

Before considering Phase 6 implementation complete, all following commands must pass cleanly:

```bash
# 1. Run all unit and integration tests
npm test

# 2. Run new Application and Renderer test suites
npm test -- src/application/policy.test.ts
npm test -- src/application/progress.test.ts
npm test -- src/application/review.test.ts
npm test -- src/renderers/json.test.ts
npm test -- src/renderers/sarif.test.ts
npm test -- src/renderers/quiet.test.ts
npm test -- src/renderers/console.test.ts
npm test -- src/commands/review.test.ts
npm test -- src/repository/scope.test.ts

# 3. Biome formatting and lint check
npm run check

# 4. TypeScript full build
npm run build
```

---

*Phase: 06-Application Layer*  
*Pattern Mapping completed: 2026-09-11*
