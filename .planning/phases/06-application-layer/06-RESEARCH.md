# Phase 6: Application Layer - Technical Research

**Phase:** 6 — Application Layer  
**Requirement IDs:** OUT-02  
**Target File:** `src/application/review.ts`, `src/application/types.ts`, `src/application/policy.ts`, `src/application/progress.ts`, `src/renderers/*`, `src/commands/review.ts`, `src/cli.ts`  
**Dependencies:** Phase 1 (Foundation & Repository), Phase 2 (Analysis Layer), Phase 3 (Intelligence Layer), Phase 4 (Model Provider), Phase 5 (Review Engine)  

---

## 1. User Constraints

*(Verbatim from `.planning/phases/06-application-layer/06-CONTEXT.md`)*

### Blocking Threshold Policy & Exit Code 1
- **D-01 (Configurable failOnSeverity):** Add `failOnSeverity` (default: `critical`) to `review` config in `octate.yaml`, overridable via CLI `--fail-on <severity>` (`critical`, `high`, `medium`, `low`, `info`). Any final finding meeting or exceeding this threshold causes `octate review` to exit with exit code 1.
- **D-02 (Advisory Non-Blocking Mode):** Support `--fail-on none` or `--fail-on off` (and `review.failOnSeverity: none` in config) allowing CI workflows to run in advisory mode without failing builds.
- **D-03 (Visible Findings Evaluation):** Evaluate blocking status against the final ranked findings list (what is reported to the user / SARIF / JSON), ensuring untruncated Critical findings are always evaluated.
- **D-04 (Terminal Failure Summary):** On exit code 1, print a clear failure summary banner to stderr (e.g., `❌ Review failed: 2 blocking findings (>= critical)`) before exit.

### Progress Streaming Contract
- **D-05 (Strongly-Typed onProgress Callback):** `ReviewUseCase` accepts `onProgress?: (event: ReviewProgressEvent) => void` in its options. Simple, pure, zero-dependency, and directly wireable to React state (Phase 7 Ink TUI) or CLI stderr spinners.
- **D-06 (Structured ReviewProgressEvent Schema):** Define `ReviewProgressEvent` with `stage: CanonicalReviewStage`, `status: 'start' | 'progress' | 'complete' | 'error'`, `message: string`, `step?: { current: number, total: number }`, and optional stage-specific payload (e.g. `toolCount`, `activeReviewer`, `findingsCount`).
- **D-07 (Output Mode Progress Isolation):** Suppress all progress streaming in `--quiet`, `--json`, and `--sarif` modes to keep stdout strictly parseable; in standard terminal mode, write progress updates to stderr.
- **D-08 (8 Typed Canonical Stages):** Emit exact roadmap canonical stages in sequence:
  1. `git:read` — Reading repository state & diff
  2. `index:update` — Updating cache & AST parse trees
  3. `symbols:resolve` — Resolving changed symbols & reference graph
  4. `diagnostics:collect` — Running linters & static analyzers
  5. `context:build` — Token budgeting & windowing review context
  6. `review:dag` — Executing AI Reviewer DAG (Structural, Semantic, Security)
  7. `review:critic` — Filtering through two-stage Critic gate
  8. `review:rank` — Deduplicating, ranking, and assembling ReviewResult

### Cancellation & Process Lifecycle
- **D-09 (Clean Immediate SIGINT Exit 130):** On Ctrl+C / SIGINT, immediately abort in-flight network requests (`AbortController`), terminate subprocess trees (`killProcessTree`), and exit with standard signal exit code 130 without interactive prompts.
- **D-10 (Console Notice on Cancellation):** Print a concise `\n⚠️ Review cancelled by user.` to stderr in standard terminal mode; stay completely silent in `--quiet`, `--json`, and `--sarif` modes.
- **D-11 (Preserve Atomic Cache on Interruption):** Completed file AST and tool analysis cache entries are preserved in `CacheStore`, ensuring subsequent runs benefit from a warm cache.
- **D-12 (Double Ctrl+C Immediate Force Kill):** The first SIGINT initiates graceful cancellation; a second SIGINT in rapid succession immediately calls `process.exit(130)` without waiting for promise resolution.

### Renderer Architecture & Non-Interactive CI Modes
- **D-13 (Pluggable ReviewRenderer Interface):** Introduce `ReviewRenderer` interface (`render(result: ReviewResult): Promise<void> | void`) implemented by `JsonRenderer`, `SarifRenderer`, `QuietRenderer`, and `ConsoleRenderer`. Phase 7's `InteractiveTuiRenderer` will implement this exact same contract.
- **D-14 (Full SARIF v2.1.0 via node-sarif-builder):** Construct valid SARIF v2.1.0 with Octate driver metadata, category rules, severity-to-level mapping (`critical`/`high` → `error`, `medium` → `warning`, `low`/`info` → `note`), physical source locations, and relatedLocations for evidence pointers.
- **D-15 (Quiet Mode Output):** In `--quiet` mode, print one line per finding: `path/to/file:line: [SEVERITY] title` followed by a single summary count line. If 0 findings exist, stay completely silent and exit 0.
- **D-16 (--output File Behavior):** When `--output <file>` is specified, write formatted output directly to the destination path (creating parent directories if necessary) and print a concise confirmation to stderr: `Wrote results to <file>`.

### The Agent's Discretion
- Exact CLI spinner animation / progress indicator styling in standard non-TUI terminal mode.
- Formatting details for `ConsoleRenderer` human-readable summary boxes and colors.
- Internal mapping of error codes to exit codes in `src/errors/index.ts` and `src/cli.ts`.

---

## 2. Architectural Responsibility Map

| Layer / Component | File Locations | Primary Responsibilities |
|---|---|---|
| **Application Layer (Layer 6)** | `src/application/review.ts` | Orchestrates the end-to-end pipeline: loads config, resolves repository & scope, invokes deterministic analysis, builds symbol index & reference graph, invokes ContextEngine, invokes ReviewEngine, evaluates blocking policy. Emits 8 canonical progress events. |
| **Progress & Policy Contracts** | `src/application/types.ts`<br>`src/application/policy.ts`<br>`src/application/progress.ts` | Defines `ReviewProgressEvent`, canonical stage types (`git:read` ... `review:rank`), blocking finding policy (`isBlockingFinding`, `countBlockingFindings`), stderr progress reporting (`StderrProgressReporter`). |
| **Pluggable Renderers** | `src/renderers/types.ts`<br>`src/renderers/json.ts`<br>`src/renderers/sarif.ts`<br>`src/renderers/quiet.ts`<br>`src/renderers/console.ts`<br>`src/renderers/index.ts` | Converts domain `ReviewResult` into external representations. Handles destination isolation (stdout vs `--output <file>`). Adheres to pluggable contract `ReviewRenderer` for Phase 7 compatibility. |
| **CLI & Commands** | `src/commands/review.ts`<br>`src/cli.ts` | Commander command setup, CLI option parsing (`--fail-on`, `--output`, `--quiet`, `--sarif`, `--json`), SIGINT / Ctrl+C lifecycle management with double-Ctrl+C force kill, exit code dispatch (0, 1, 2, 3, 4, 5, 130). |
| **Configuration Schema** | `src/config/schema.ts` | Adds `failOnSeverity` (`'critical' \| 'high' \| 'medium' \| 'low' \| 'info' \| 'none' \| 'off'`) to `ReviewConfigSchema`. |
| **Repository Scope** | `src/repository/scope.ts` | Resolves review scope. Fixes `getStagedFiles` and `getWorkingFiles` to extract changed files from `git.statusMatrix` so `--staged` and `--working` produce non-empty changed file sets. Defaults empty CLI scope to `working-tree`. |
| **Review Engine (Layer 5)** | `src/review/engine.ts`<br>`src/review/types.ts` | Accepts optional `onProgress` callback in `ReviewEngineInput` to emit canonical stages 6 (`review:dag`), 7 (`review:critic`), and 8 (`review:rank`). |

---

## 3. Research Summary

Phase 6 implements the **Application Layer** (Layer 6 in Octate's 8-layer strict dependency architecture). Up to Phase 5, all domain engines (Repository, Analysis, Intelligence, Model Provider, Review Engine) were implemented as pure domain libraries with zero UI or CLI coupling.

To execute `octate review` as a cohesive, production-grade CLI tool, Phase 6 introduces:
1. **`ReviewUseCase`**: A central application service that chains Layer 1 through Layer 5 in sequence, handling cancellation, error propagation, and structured progress streaming.
2. **Progress Streaming Contract**: An 8-stage canonical pipeline (`git:read` through `review:rank`) emitting strongly-typed `ReviewProgressEvent` updates via an optional callback. Standard terminal runs stream progress to `stderr`, while machine-readable modes (`--json`, `--sarif`, `--quiet`) maintain strict stdout hygiene.
3. **Pluggable Renderer Architecture**: Encapsulates `ReviewResult` transformation into `JsonRenderer`, `SarifRenderer` (SARIF v2.1.0 via `node-sarif-builder`), `QuietRenderer` (one-line-per-finding, totally silent on 0 findings), and `ConsoleRenderer` (colorized badges via `picocolors`). Phase 7's interactive React/Ink TUI will plug into this exact same `ReviewRenderer` interface.
4. **Stable Exit Codes & Blocking Policy (`OUT-02`)**: Deterministic exit code resolution:
   - `0`: Review passed (no blocking findings or advisory mode).
   - `1`: Review completed with blocking findings (evaluated against final ranked findings using configurable `failOnSeverity`, default: `critical`).
   - `2`: Configuration or CLI usage error (`ConfigurationError`).
   - `3`: Repository, Git, Parse, Analysis, or Context error (`RepositoryError`, `GitError`, `ParseError`, `AnalysisError`, `ContextError`).
   - `4`: Model provider error (`ModelError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `AuthenticationError`, `QuotaExceededError`).
   - `5`: Validation or internal unexpected error (`ValidationError`, `InternalError`).
   - `130`: SIGINT / Ctrl+C cancellation.
5. **Process & Signal Lifecycle**: Immediate graceful cancellation on the first SIGINT (aborts `AbortController`, kills subprocess trees via `killProcessTree`, preserves warm atomic cache entries), instant force-exit (`process.exit(130)`) on a second SIGINT, and stderr cancellation banner.

---

## 4. Standard Stack / Ecosystem

### Core Dependencies

| Package | Version | Purpose | Usage in Phase 6 |
|---|---|---|---|
| `node-sarif-builder` | 5.0.0 | SARIF v2.1.0 generation | Builds valid SARIF v2.1.0 logs with tool driver metadata, rule descriptors, physical locations, related locations, and property bags. |
| `@microsoft/sarif` | latest | SARIF types | Provides TypeScript definitions (`Log`, `Run`, `Result`, `Location`) for SARIF v2.1.0 schema compliance. |
| `picocolors` | 1.1.1 | Terminal styling | Zero-dependency ANSI formatting for `ConsoleRenderer`, `StderrProgressReporter`, and exit code failure banners. |
| `commander` | 15.0.0 | CLI command definition | Registers `review` options (`--fail-on`, `--output`, `--json`, `--sarif`, `--quiet`, `--no-tui`) and global options. |
| `zod` | 4.5.4 | Schema validation | Validates updated `ReviewConfigSchema` with new `failOnSeverity` field. |
| `pino` | 10.3.1 | Structured logging | Internal structured diagnostics and trace logs (`commands:review`, `application:review`). |

---

## 5. Architecture Patterns

### 5.1 End-to-End Application Pipeline & Data Flow

```
CLI Entry Point (`src/commands/review.ts`)
   │
   ├─► Parses CLI options & validates exclusivity (--json vs --sarif vs --quiet)
   ├─► Registers SIGINT / Ctrl+C handler with double-SIGINT detection
   ├─► Selects ReviewRenderer (JsonRenderer | SarifRenderer | QuietRenderer | ConsoleRenderer)
   │
   ▼
ReviewUseCase (`src/application/review.ts`)
   │
   ├── [Stage 1: git:read] ───────────────────────► findGitRoot() + resolveScope()
   │                                                 (Extracts diff & FileChange[])
   │
   ├── [Stage 2: index:update] ───────────────────► parseFiles() via Tree-sitter
   │                                                 (Content-hash caching via CacheStore)
   │
   ├── [Stage 3: symbols:resolve] ────────────────► extractSymbols() + createSymbolIndex()
   │                                                 + createPathResolver() + createReferenceGraph()
   │
   ├── [Stage 4: diagnostics:collect] ────────────► collectDiagnostics()
   │                                                 (Runs tsc, biome, ruff, mypy, bandit, pytest)
   │
   ├── [Stage 5: context:build] ──────────────────► ContextEngine.buildContext()
   │                                                 (Token budget selection & trust demarcation)
   │
   ├── [Stage 6: review:dag] ─────────────────────► ReviewEngine: Structural, Semantic, Security
   │                                                 (Executed concurrently with heuristic triggers)
   │
   ├── [Stage 7: review:critic] ──────────────────► ReviewEngine: Two-Stage Critic
   │                                                 (Deterministic floor + critic.v1 model)
   │
   └── [Stage 8: review:rank] ────────────────────► ReviewEngine: Post-Critic Consolidation
                                                     + Composite Ranking & Protected Truncation
                                                     => Assembles authoritative ReviewResult
   │
   ▼
Blocking Policy & Exit Code Resolution (`src/application/policy.ts`)
   │
   ├─► Evaluates findings against `failOnSeverity` (default: critical)
   │
   ▼
Renderer (`src/renderers/`)
   │
   ├─► Writes formatted output to stdout OR --output <file>
   │
   ▼
Process Exit (0 = Passed, 1 = Blocking Findings, 2-5 = Typed Errors, 130 = SIGINT)
```

### 5.2 Canonical Progress Streaming State Machine

The sequence of 8 canonical stages is deterministic. Each stage transitions through `'start'` and `'complete'`, or transitions to `'error'` if interrupted:

```
[Idle]
  │
  ├─► [git:read: start] ──────────► [git:read: complete] (payload: fileCount)
  │
  ├─► [index:update: start] ──────► [index:update: complete] (payload: parsedCount)
  │
  ├─► [symbols:resolve: start] ───► [symbols:resolve: complete] (payload: symbolCount)
  │
  ├─► [diagnostics:collect: start]► [diagnostics:collect: complete] (payload: diagnosticCount)
  │
  ├─► [context:build: start] ─────► [context:build: complete] (payload: totalTokens)
  │
  ├─► [review:dag: start] ────────► [review:dag: complete] (payload: candidateCount)
  │
  ├─► [review:critic: start] ─────► [review:critic: complete] (payload: postCriticCount)
  │
  └─► [review:rank: start] ───────► [review:rank: complete] (payload: totalFindings)
```

#### Structured Progress Schema
```ts
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
```

### 5.3 Signal Cancellation & Process Tree Termination Flow

```
User triggers Ctrl+C (SIGINT)
   │
   ├─► Has SIGINT been pressed previously within active run?
   │     ├── YES (Double Ctrl+C) ─────────► process.exit(130) immediately (D-12)
   │     └── NO (First Ctrl+C):
   │           │
   │           ├─► If standard terminal mode: print "\n⚠️ Review cancelled by user." to stderr (D-10)
   │           ├─► controller.abort(new DOMException('Review cancelled by user', 'AbortError'))
   │           │
   │           ├─► AbortSignal cascades:
   │           │     ├─► NVIDIA HTTP requests aborted immediately (fetch AbortSignal)
   │           │     ├─► Subprocesses aborted & killProcessTree() kills child trees (D-09)
   │           │     └─► File AST & tool entries already written in CacheStore remain valid (D-11)
   │           │
   │           └─► Command catch boundary sets exitCode = 130 and exits cleanly
```

### 5.4 Pluggable Renderer Polymorphism

All renderers implement the single contract defined by `ReviewRenderer`:

```ts
export interface RendererOptions {
  outputFile?: string;
  stream?: NodeJS.WritableStream;
}

export interface ReviewRenderer {
  render(result: ReviewResult): Promise<void> | void;
}
```

#### Output Destination Logic (per D-16)
```ts
export async function writeRenderedOutput(
  content: string,
  options?: RendererOptions
): Promise<void> {
  if (options?.outputFile) {
    const { dirname } = await import('node:path');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(dirname(options.outputFile), { recursive: true });
    await writeFile(options.outputFile, content, 'utf-8');
    // Concise confirmation written to stderr per D-16
    process.stderr.write(`Wrote results to ${options.outputFile}\n`);
  } else {
    const stream = options?.stream ?? process.stdout;
    stream.write(content.endsWith('\n') ? content : `${content}\n`);
  }
}
```

### 5.5 SARIF v2.1.0 Builder Architecture (via `node-sarif-builder`)

To meet D-14 and GitHub Code Scanning integration requirements:

```ts
import { SarifBuilder, SarifResultBuilder, SarifRuleBuilder, SarifRunBuilder } from 'node-sarif-builder';
import type { RankedFinding, ReviewResult, ReviewSeverity } from '../review/types.js';

export function severityToSarifLevel(severity: ReviewSeverity): 'error' | 'warning' | 'note' | 'none' {
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
```

Each finding maps to:
- `ruleId`: `finding.category` (with corresponding `SarifRuleBuilder` in the run driver)
- `level`: `severityToSarifLevel(finding.severity)`
- `message`: `{ text: finding.message }`
- `locations`: `physicalLocation` with `artifactLocation.uri = finding.file`, `region.startLine = finding.startLine ?? 1`
- `relatedLocations`: array of physical locations pointing to evidence items or related files
- `properties`: `{ id: finding.id, title: finding.title, confidence: finding.confidence, compositeScore: finding.compositeScore, blastRadius: finding.blastRadius, evidenceStrength: finding.evidenceStrength, contributingReviewers: finding.contributingReviewers, suggestedFix: finding.suggestedFix }`

---

## 6. Don't Hand-Roll / Anti-Patterns

| Anti-Pattern | Why It Breaks | Correct Approach |
|---|---|---|
| **Hand-Rolling Raw SARIF JSON** | SARIF schema is notoriously strict (RFC requires exact property nesting, URI encodings, rule index references). Hand-rolling misses schema requirements causing GitHub Code Scanning rejections. | Use `node-sarif-builder` (`SarifBuilder`, `SarifRunBuilder`, `SarifRuleBuilder`, `SarifResultBuilder`), which is already installed and verified. |
| **Writing Progress or Banners to `stdout`** | Pollutes stdout when `--json` or `--sarif` is piped into tools like `jq` or uploaded to CI artifacts, corrupting parsers. | Strictly isolate stdout for data. All progress events, spinners, failure summaries, and cancellation notices go to `stderr` (D-07). |
| **Evaluating Blocking Threshold Before Ranking** | Critic or Ranking might downgrade or truncate candidate findings. If pre-dedup findings trigger blocking exit codes, developers will get false-alarm build failures on findings that were ultimately discarded. | Evaluate blocking status (`failOnSeverity`) **only** against the final ranked `result.findings` (D-03). |
| **Orphaning Subprocesses on SIGINT** | If a child linter (`tsc`, `mypy`) is spawned and SIGINT occurs, standard Node `child.kill('SIGTERM')` only kills the shell wrapper, leaving worker processes running indefinitely. | Use `killProcessTree(pid, 'SIGTERM')` (implemented in `src/cancellation/subprocess.ts`) which kills the process group or calls `taskkill /T /F` on Windows. |
| **Swallowing AbortErrors into Exit Code 5** | Catching an `AbortError` and routing it into the generic error boundary causes Ctrl+C to exit with internal error 5 instead of Unix signal standard 130. | Explicitly check for abort errors / signals and exit with code 130 (D-09). |
| **Ignoring `--fail-on none` / `off`** | If advisory mode is not supported, teams cannot run Octate in CI without risking broken builds during rollout. | Support `--fail-on none` and `--fail-on off` (D-02) returning exit code 0 regardless of finding severity. |

---

## 7. Common Pitfalls & Landmines

### Pitfall 1: `scope.ts` Empty Staged and Working Files
**The Trap:** In `src/repository/scope.ts`, `getStagedFiles` and `getWorkingFiles` were left as stubs:
```ts
async function getStagedFiles(_repoRoot: string): Promise<FileChange[]> {
  return [];
}
```
If a user runs `octate review --staged` or `octate review --working`, `scope.files` is `[]`. The `ReviewEngine` checks `if (input.changedFiles.length === 0)` and immediately short-circuits with 0 findings, despite the diff containing changes!  
**The Solution:** Implement `getStagedFiles` and `getWorkingFiles` in `src/repository/scope.ts` by reading `git.statusMatrix` and mapping modified/added/deleted entries into `FileChange[]`.

### Pitfall 2: Default Scope Resolution on Plain `octate review`
**The Trap:** In `src/commands/review.ts`, `validateScope()` currently throws:
```ts
if (scopes === 0) {
  throw new ConfigurationError('No scope specified. Use one of: --staged, --working ...');
}
```
This violates Success Criterion 1: "`octate review` executes complete pipeline: load config → discover repository → determine scope...". In standard CLI usage, running `octate review` without flags should auto-detect scope (defaulting to `working-tree`, or `staged` if working tree is clean). Furthermore, positional refs (e.g. `octate review HEAD~1` or `octate review main..HEAD`) must be parsed into commit or range scopes.  
**The Solution:** In `ReviewUseCase` / `review.ts`, determine default scope gracefully:
1. If explicit flag provided (`--staged`, `--working`, `--commit`, `--range`, `--branch`), use it.
2. If positional `refs` provided, parse as range (if `..` or `...`) or commit ref.
3. If neither provided, default to `working-tree`.

### Pitfall 3: `ReviewConfigSchema` Missing `failOnSeverity`
**The Trap:** `ReviewConfigSchema` in `src/config/schema.ts` only defines `severity`, `maxFindings`, `minConfidence`. Attempting to set `failOnSeverity: 'critical'` in `octate.yaml` or through `cliConfig` will fail schema validation.  
**The Solution:** Update `ReviewConfigSchema` to include:
```ts
export const ReviewConfigSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).default('medium'),
  failOnSeverity: z
    .enum(['critical', 'high', 'medium', 'low', 'info', 'none', 'off'])
    .default('critical'),
  maxFindings: z.number().int().positive().max(100).default(50),
  minConfidence: z.number().min(0).max(1).default(0.6),
});
```

### Pitfall 4: Jest Timeout on Real Static Analyzers
**The Trap:** In tests, if `analyzeFiles` is called on temporary directories without mocking `collectDiagnostics`, it will attempt to spawn system tools (`tsc`, `biome`, `ruff`, `mypy`, `pyright`, `bandit`, `pytest`). If these tools are missing or slow, Jest's default 5000ms timeout expires.  
**The Solution:** In unit tests for `ReviewUseCase`, inject mock dependencies or pass pre-computed analysis/context inputs, or mock `analyzeFiles` / tool execution to ensure fast (<200ms) deterministic execution.

### Pitfall 5: Double Ctrl+C Event Loop Starvation
**The Trap:** If a second SIGINT arrives while an async operation is hanging, simply listening for `controller.signal.onabort` will never trigger a second time.  
**The Solution:** Attach a direct `process.on('SIGINT', ...)` handler at the command level that increments a counter. If `sigintCount >= 2`, immediately execute `process.exit(130)`.

---

## 8. Validation Architecture

### 8.1 Test Strategy

Phase 6 validation requires four focused test suites:

1. **Unit Tests — Policy & Blocking Evaluation (`src/application/policy.test.ts`)**:
   - Verify `isBlockingFinding` for all severities against thresholds (`critical`, `high`, `medium`, `low`, `info`, `none`, `off`).
   - Verify `countBlockingFindings` accurately tallies visible findings.
   - Verify failure banner generation with singular/plural finding grammar.
   - Verify advisory mode (`none`/`off`) returns exit code 0 even when critical findings exist.

2. **Unit Tests — Renderers (`src/renderers/*.test.ts`)**:
   - `JsonRenderer`: Validates output matches `JSON.parse(result)`. Validates `--output` file write and parent directory creation.
   - `SarifRenderer`: Validates schema output against SARIF v2.1.0 structure (`$schema`, `version: "2.1.0"`, driver `Octate`, rule definitions, results locations, level mapping, properties).
   - `QuietRenderer`: Validates one-line-per-finding format `file:line: [SEVERITY] title` + summary line. Validates **zero stdout output** when `findings.length === 0`.
   - `ConsoleRenderer`: Validates human-readable badges, severity icons, file paths, fixes, and summary box.

3. **Unit Tests — Progress Streaming & Stderr Reporter (`src/application/progress.test.ts`)**:
   - Verify `StderrProgressReporter` formats and outputs all 8 canonical stages.
   - Verify suppression in quiet/json/sarif modes.
   - Verify TTY vs non-TTY line clearing behavior.

4. **Integration Tests — Application Pipeline & CLI (`src/application/review.test.ts` & `src/commands/review.test.ts`)**:
   - End-to-end execution of `ReviewUseCase` with mocked Model Provider: verify full stage sequence, config merging, scope resolution, ranking, and final result structure.
   - Verify empty diff short-circuiting.
   - Verify Ctrl+C / SIGINT cancellation propagates and cleans up with exit code 130.
   - Verify CLI option validation: mutual exclusivity of `--json`, `--sarif`, `--quiet`.
   - Verify `--fail-on` overrides config setting and sets exit code 1 on blocking findings.

### 8.2 Verification Commands

Run these exact commands to verify Phase 6 completion:

```bash
# 1. Run full test suite including new application layer and renderer tests
npm test

# 2. Run specific Phase 6 test suites
npm test -- src/application/policy.test.ts
npm test -- src/application/progress.test.ts
npm test -- src/application/review.test.ts
npm test -- src/renderers/json.test.ts
npm test -- src/renderers/sarif.test.ts
npm test -- src/renderers/quiet.test.ts
npm test -- src/renderers/console.test.ts
npm test -- src/commands/review.test.ts

# 3. Biome formatting and lint check
npm run check

# 4. TypeScript compilation check
npm run build
```
