# Phase 6: Application Layer - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The Application Layer provides end-to-end orchestration for the code review pipeline (`ReviewUseCase`), bridging CLI commands to the underlying domain layers (Repository, Analysis, Intelligence, Model Provider, and Review Engine). It handles pipeline execution, live progress event streaming, signal cancellation, exit code mapping, and non-interactive output rendering (`--json`, `--sarif`, `--quiet`, and file output).

In scope:
- `ReviewUseCase` application orchestrator executing the full review lifecycle: configuration loading → repository discovery & scope resolution → Git diff generation → static analysis & diagnostics → symbol indexing & context building → model provider instantiation → review DAG, critic, deduplication, and ranking.
- Progress event streaming (`ReviewProgressEvent`) emitting 8 canonical pipeline stages to callers via a strongly-typed callback.
- Uniform cancellation propagation (SIGINT / Ctrl+C) with child process-tree termination, HTTP aborts, double-Ctrl+C force exit, and standard exit code 130.
- Exit code mapping (`OUT-02`): 0=passed, 1=blocking findings, 2=usage/config error, 3=repo/git/analysis/context error, 4=model/provider error, 5=internal error.
- Configurable blocking findings threshold (`review.failOnSeverity` with default `critical`, `--fail-on <severity>`, and `none`/`off` advisory mode).
- Pluggable `ReviewRenderer` architecture delivering `JsonRenderer`, `SarifRenderer` (SARIF v2.1.0), `QuietRenderer`, and `ConsoleRenderer` for automation, CI/CD, and file outputs.

Out of scope:
- Interactive React/Ink TUI workspace, terminal widgets, keyboard navigation, and interactive diff viewers (Phase 7).
- Agentic fix workflows (`octate fix <id>`) and suppression learning (`octate suppress <id>`) (deferred to v2).
- Hosted inference server or cloud execution.
</domain>

<decisions>
## Implementation Decisions

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

### the agent's Discretion
- Exact CLI spinner animation / progress indicator styling in standard non-TUI terminal mode.
- Formatting details for `ConsoleRenderer` human-readable summary boxes and colors.
- Internal mapping of error codes to exit codes in `src/errors/index.ts` and `src/cli.ts`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Domain & Review Engine
- `src/review/engine.ts` — `ReviewEngine` class and pipeline execution entry point
- `src/review/types.ts` — `ReviewResult`, `RankedFinding`, `ReviewSummary`, `ExecutionMetadata` domain models
- `src/commands/review.ts` — CLI command entry point and options parsing
- `src/config/schema.ts` — `OctateConfigSchema`, `ReviewConfigSchema`, and configuration precedence

### Analysis & Context Engine
- `src/analysis/orchestrator.ts` — Deterministic static analysis pipeline
- `src/intelligence/index.ts` — Context engine and prompt serialization API
- `src/model/abstraction.ts` — `createModelProvider` factory and `ReviewModel` interface

### Process Lifecycle & Infrastructure
- `src/cancellation/controller.ts` — `CancellationController` and `withCancellation`
- `src/cancellation/subprocess.ts` — `spawnWithSignal` and `killProcessTree`
- `src/errors/index.ts` — `OctateError` hierarchy and exit code definitions
- `src/logging/index.ts` — Pino structured logging and secret redaction
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CancellationController` (`src/cancellation/controller.ts`): Signal management with parent/child hierarchies and abort listeners.
- `killProcessTree` (`src/cancellation/subprocess.ts`): Graceful process termination sending SIGTERM followed by SIGKILL to entire child process trees.
- `node-sarif-builder` & `@microsoft/sarif`: Installed dependencies ready for constructing standard SARIF logs.
- `picocolors`: Fast, zero-dependency ANSI styling for `ConsoleRenderer` and failure banners.
- `ReviewEngine` (`src/review/engine.ts`): Authoritative review pipeline returning complete `ReviewResult`.

### Established Patterns
- **Pure Domain Separation:** Domain engines (`ReviewEngine`, `ContextEngine`, `AnalysisOrchestrator`) have zero UI or CLI dependencies; `ReviewUseCase` acts as the application service orchestrating them.
- **Typed Exit Codes:** Exit codes mapped deterministically in `src/errors/index.ts`: 0=success, 1=blocking findings, 2=config, 3=repo/analysis, 4=model, 5=internal.
- **Strict Output Separation:** Machine-readable outputs (`--json`, `--sarif`) write exclusively to stdout (or `--output`), while progress and logging stream to stderr.

### Integration Points
- `src/usecase/review.ts` (or `src/application/review.ts`): New application orchestrator `ReviewUseCase`.
- `src/formatters/` (or `src/renderers/`): Pluggable renderers (`JsonRenderer`, `SarifRenderer`, `QuietRenderer`, `ConsoleRenderer`).
- `src/commands/review.ts`: Update CLI command handler to instantiate and execute `ReviewUseCase`.
- `src/cli.ts`: Global signal handling (SIGINT/SIGTERM) and top-level exit code resolution.
</code_context>

<specifics>
## Specific Ideas
- In CI workflows, `octate review --sarif --output report.sarif` followed by upload to GitHub Code Scanning enables seamless automated PR review.
- Double Ctrl+C provides an escape hatch if a child subprocess or network request hangs during graceful teardown.
</specifics>

<deferred>
## Deferred Ideas
- Interactive Ink React TUI workspace — Phase 7.
- Agentic fix workflows (`octate fix`) — deferred to v2 (`FIX-01`).
- Suppression learning (`octate suppress`) — deferred to v2 (`RULES-02`).
</deferred>

---

*Phase: 06-Application Layer*
*Context gathered: 2026-09-11*
